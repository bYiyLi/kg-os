module github.com/bYiyLi/kg-os

go 1.27.1

require (
	github.com/BurntSushi/toml v1.4.1-0.20240526193622-a339e1f7089c
	github.com/mattn/go-sqlite3 v1.14.52
	github.com/zeebo/blake3 v0.2.4
	golang.org/x/sys v0.48.0
	gopkg.in/yaml.v3 v3.0.1
)

require (
	github.com/klauspost/cpuid/v2 v2.0.12 // indirect
	golang.org/x/exp/typeparams v0.0.0-20231108232855-2478ac86f678 // indirect
	golang.org/x/mod v0.41.0 // indirect
	golang.org/x/sync v0.23.0 // indirect
	golang.org/x/telemetry v0.0.0-20260908163034-4bcc4b2ee518 // indirect
	golang.org/x/tools v0.50.0 // indirect
	golang.org/x/vuln v1.8.0 // indirect
	honnef.co/go/tools v0.8.1 // indirect
)

tool (
	golang.org/x/vuln/cmd/govulncheck
	honnef.co/go/tools/cmd/staticcheck
)
