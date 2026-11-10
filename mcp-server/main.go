package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func main() {
	server := mcp.NewServer(&mcp.Implementation{Name: "ticker", Title: "ticker tool", Version: "1.0.0"}, &mcp.ServerOptions{})
	mcp.AddTool(server, &mcp.Tool{
		Name:        "ticker",
		Description: "そのままtickerを返す",
	}, handleTicker)
	err := server.Run(context.Background(), &mcp.StdioTransport{})
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
