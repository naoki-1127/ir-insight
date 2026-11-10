package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// backendClient は backend の /api/companies を x-api-key 認証で呼ぶクライアント。
// 登録処理（Company保存・8-Kジョブ投入）はすべて backend 側に任せ、ここでは呼ぶだけにする。
type backendClient struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func newBackendClient() (*backendClient, error) {
	apiKey := os.Getenv("MCP_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("MCP_API_KEY is not set")
	}
	baseURL := os.Getenv("BACKEND_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	return &backendClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// Company は GET /api/companies/search の1件分。
type Company struct {
	CIK    string `json:"cik"`
	Ticker string `json:"ticker"`
	Name   string `json:"name"`
}

// RegisteredCompany は POST /api/companies が返す company。
type RegisteredCompany struct {
	ID        string `json:"id"`
	CIK       string `json:"cik"`
	Ticker    string `json:"ticker"`
	Name      string `json:"name"`
	Market    string `json:"market"`
	CreatedAt string `json:"createdAt"`
}

func (c *backendClient) do(ctx context.Context, method, path string, body any, out any) error {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reqBody = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reqBody)
	if err != nil {
		return err
	}
	req.Header.Set("x-api-key", c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()

	b, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("backend %s %s: %d %s", method, path, res.StatusCode, truncate(string(b), 200))
	}
	return json.Unmarshal(b, out)
}

func (c *backendClient) searchCompanies(ctx context.Context, q string) ([]Company, error) {
	var out []Company
	err := c.do(ctx, http.MethodGet, "/api/companies/search?q="+url.QueryEscape(q), nil, &out)
	return out, err
}

func (c *backendClient) registerCompany(ctx context.Context, company Company) (RegisteredCompany, error) {
	var out struct {
		Company RegisteredCompany `json:"company"`
	}
	err := c.do(ctx, http.MethodPost, "/api/companies", company, &out)
	return out.Company, err
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
