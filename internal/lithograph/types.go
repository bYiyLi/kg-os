package lithograph

import (
	"encoding/json"
	"fmt"
)

const (
	expectedExtension     = "0.3.0"
	expectedStorageFormat = 3
	expectedCypherProfile = "CY25-2026.08"
)

type Baseline struct {
	DatabaseID    string
	StorageFormat int
	CypherProfile string
}

type Result struct {
	Columns []string            `json:"columns"`
	Rows    [][]json.RawMessage `json:"rows"`
	Summary json.RawMessage     `json:"summary"`
}

type Event struct {
	Ordinal int
	Type    string
	Data    json.RawMessage
}

type QueryRequest struct {
	At     string
	Cypher string
	Params map[string]any
}

type ExecuteRequest struct {
	Branch  string
	Cypher  string
	Params  map[string]any
	Author  *string
	Message *string
}

type QueryResult struct {
	State  string
	Result Result
}

type versionInfo struct {
	Extension     string  `json:"extension"`
	DatabaseID    *string `json:"databaseId"`
	CypherProfile string  `json:"cypherProfile"`
	StorageFormat struct {
		Current *int `json:"current"`
		Min     int  `json:"min"`
		Max     int  `json:"max"`
	} `json:"storageFormat"`
}

func decodeResult(raw []byte) (Result, error) {
	var result Result
	if err := json.Unmarshal(raw, &result); err != nil {
		return Result{}, fmt.Errorf("decode Lithograph result: %w", err)
	}
	return result, nil
}

func columnIndex(columns []string, name string) (int, bool) {
	for index, column := range columns {
		if column == name {
			return index, true
		}
	}
	return -1, false
}

func stringCell(result Result, row int, column string) (string, error) {
	columnPosition, ok := columnIndex(result.Columns, column)
	if !ok {
		return "", fmt.Errorf("lithograph result is missing %q column", column)
	}
	if row < 0 || row >= len(result.Rows) || columnPosition >= len(result.Rows[row]) {
		return "", fmt.Errorf("lithograph result is missing row %d column %q", row, column)
	}
	var value string
	if err := json.Unmarshal(result.Rows[row][columnPosition], &value); err != nil {
		return "", fmt.Errorf("decode Lithograph %q value: %w", column, err)
	}
	return value, nil
}
