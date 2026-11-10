// edgar-checker は、登録済み企業について SEC EDGAR 上の最新 8-K（Item 2.02）を
// 並行に問い合わせるだけのステートレスな内部サービス。
// DB・キューへのアクセスは持たず、backend からの HTTP 呼び出しに応答するだけ。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"
	"golang.org/x/time/rate"
)

// CompanyRequest は backend から渡される問い合わせ対象1件分。
type CompanyRequest struct {
	CompanyID string `json:"companyId"`
	CIK       string `json:"cik"`
	Ticker    string `json:"ticker"`
}

// Filing は見つかった8-Kの情報。backend/src/services/edgar.service.ts の
// getLatest8k が返す形と揃えてある。
type Filing struct {
	AccessionNumber string `json:"accessionNumber"`
	FilingDate      string `json:"filingDate"`
	PrimaryDocument string `json:"primaryDocument"`
}

// CompanyResult は1社分の問い合わせ結果。LatestFiling が nil なら
// Item 2.02 の8-Kが見つからなかったことを意味する。
type CompanyResult struct {
	CompanyID    string  `json:"companyId"`
	CIK          string  `json:"cik"`
	Ticker       string  `json:"ticker"`
	LatestFiling *Filing `json:"latestFiling"`
	Error        string  `json:"error,omitempty"`
}

type submissionsResponse struct {
	Filings struct {
		Recent struct {
			Form            []string `json:"form"`
			Items           []string `json:"items"`
			AccessionNumber []string `json:"accessionNumber"`
			FilingDate      []string `json:"filingDate"`
			PrimaryDocument []string `json:"primaryDocument"`
		} `json:"recent"`
	} `json:"filings"`
}

const secSubmissionsURLFormat = "https://data.sec.gov/submissions/%s.json"

// 同時にEDGARへ投げるgoroutine数。
const maxConcurrency = 5

var httpClient = &http.Client{Timeout: 15 * time.Second}

// SECのFair Access Policy(https://www.sec.gov/os/webmaster-faq#developers)により
// 全リクエスト合計で概ね10req/秒までが目安とされている。安全側に振って8req/秒に制限する。
var limiter = rate.NewLimiter(rate.Limit(8), 1)

func main() {
	userAgent := os.Getenv("SEC_USER_AGENT")
	if userAgent == "" {
		// SECはUser-Agent未設定のリクエストをブロックすることがあるため必須。
		// 本番では実際の連絡先を SEC_USER_AGENT 環境変数で設定すること。
		userAgent = "IRInsight contact@example.com"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", handleHealthz)
	mux.HandleFunc("/check-latest-8k", handleCheckLatest8K(userAgent))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("[edgar-checker] listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("[edgar-checker] server error: %v", err)
	}
}

func handleHealthz(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
}

// handleCheckLatest8K は企業リストを受け取り、各社のEDGAR最新8-Kを並行取得して返す。
// 1社分の取得に失敗しても他社の処理は継続し、失敗した企業は Result.Error に理由を詰めて返す
// （backend側は次回cronで再試行できるため、ここで全体を失敗させる必要はない）。
func handleCheckLatest8K(userAgent string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var companies []CompanyRequest
		if err := json.NewDecoder(r.Body).Decode(&companies); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
		defer cancel()

		results := make([]CompanyResult, len(companies))

		g, ctx := errgroup.WithContext(ctx)
		g.SetLimit(maxConcurrency)

		for i, c := range companies {
			i, c := i, c // Go1.22以降ならループ変数キャプチャは不要だが明示しておく
			g.Go(func() error {
				results[i] = fetchLatestFiling(ctx, c, userAgent)
				return nil // 個別エラーはCompanyResult.Errorに詰めるのでここでは握りつぶす
			})
		}
		_ = g.Wait()

		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(results); err != nil {
			log.Printf("[edgar-checker] encode response error: %v", err)
		}
	}
}

func fetchLatestFiling(ctx context.Context, c CompanyRequest, userAgent string) CompanyResult {
	result := CompanyResult{CompanyID: c.CompanyID, CIK: c.CIK, Ticker: c.Ticker}

	if err := limiter.Wait(ctx); err != nil {
		result.Error = fmt.Sprintf("rate limiter: %v", err)
		return result
	}

	url := fmt.Sprintf(secSubmissionsURLFormat, c.CIK)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	req.Header.Set("User-Agent", userAgent)

	resp, err := httpClient.Do(req)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		result.Error = fmt.Sprintf("SEC API returned %d", resp.StatusCode)
		return result
	}

	var payload submissionsResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		result.Error = fmt.Sprintf("decode response: %v", err)
		return result
	}

	result.LatestFiling = findLatestItem202(payload)
	return result
}

// findLatestItem202 は Form=="8-K" かつ items に "2.02" を含む最初の（=最新の）ものを返す。
// backend/src/services/edgar.service.ts の getLatest8k と同じロジック。
func findLatestItem202(payload submissionsResponse) *Filing {
	recent := payload.Filings.Recent
	for i, form := range recent.Form {
		if form != "8-K" {
			continue
		}
		if i >= len(recent.Items) || !strings.Contains(recent.Items[i], "2.02") {
			continue
		}
		return &Filing{
			AccessionNumber: recent.AccessionNumber[i],
			FilingDate:      recent.FilingDate[i],
			PrimaryDocument: recent.PrimaryDocument[i],
		}
	}
	return nil
}
