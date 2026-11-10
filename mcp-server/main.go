package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	backend, err := newBackendClient()
	if err != nil {
		log.Fatal("config error:", err)
	}

	server := mcp.NewServer(&mcp.Implementation{Name: "ticker", Title: "ticker tool", Version: "1.0.0"}, &mcp.ServerOptions{})
	mcp.AddTool(server, &mcp.Tool{
		Name:        "ticker",
		Description: "そのままtickerを返す",
	}, handleTicker)
	mcp.AddTool(server, &mcp.Tool{
		Name:        "register_company",
		Description: "米国株のティッカーを指定して企業を登録する。登録すると直近2年分の決算(8-K Item 2.02)の取得・要約が始まる。",
	}, backend.handleRegisterCompany)

	err = server.Run(context.Background(), &mcp.StdioTransport{})
	if err != nil {
		log.Fatal("server error:", err)
	}
}

// TickerInput は "ticker" ツールの入力スキーマを定義します。
type TickerInput struct {
	Text string `json:"text" jsonschema:"UTF-8 text to be mirrored"`
}

// TickerOutput は "ticker" ツールの出力スキーマを定義します。
type TickerOutput struct {
	Text string `json:"text" jsonschema:"Mirrored text"`
}

func handleTicker(_ context.Context, _ *mcp.CallToolRequest, input TickerInput) (*mcp.CallToolResult, TickerOutput, error) {
	return nil, TickerOutput{Text: "ANET"}, nil
}

// RegisterCompanyInput は "register_company" ツールの入力スキーマ。
type RegisterCompanyInput struct {
	Ticker string `json:"ticker" jsonschema:"US stock ticker symbol, e.g. ANET"`
}

// RegisterCompanyOutput は "register_company" ツールの出力スキーマ。
type RegisterCompanyOutput struct {
	Company RegisteredCompany `json:"company"`
}

// handleRegisterCompany は ticker から SEC の企業情報(CIK・社名)を backend の検索で確定させ、
// backend の登録APIを呼ぶ。CIK をモデルに推測させないよう、入力は ticker だけにしている。
func (c *backendClient) handleRegisterCompany(ctx context.Context, _ *mcp.CallToolRequest, input RegisterCompanyInput) (*mcp.CallToolResult, RegisterCompanyOutput, error) {
	ticker := strings.ToUpper(strings.TrimSpace(input.Ticker))
	if ticker == "" {
		return nil, RegisterCompanyOutput{}, fmt.Errorf("ticker is required")
	}

	candidates, err := c.searchCompanies(ctx, ticker)
	if err != nil {
		return nil, RegisterCompanyOutput{}, err
	}
	var found *Company
	for i := range candidates {
		if strings.EqualFold(candidates[i].Ticker, ticker) {
			found = &candidates[i]
			break
		}
	}
	if found == nil {
		return nil, RegisterCompanyOutput{}, fmt.Errorf("ticker %q not found in SEC company list", ticker)
	}

	registered, err := c.registerCompany(ctx, *found)
	if err != nil {
		return nil, RegisterCompanyOutput{}, err
	}
	return nil, RegisterCompanyOutput{Company: registered}, nil
}
