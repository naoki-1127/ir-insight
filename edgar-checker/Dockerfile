# ビルドコンテキストはリポジトリルート（go.mod/go.sum をルートで共有しているため）
FROM golang:1.27-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY edgar-checker/ ./edgar-checker/
RUN CGO_ENABLED=0 go build -o /edgar-checker ./edgar-checker

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
COPY --from=builder /edgar-checker /edgar-checker
EXPOSE 8080
CMD ["/edgar-checker"]
