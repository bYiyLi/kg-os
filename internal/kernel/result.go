package kernel

import (
	"encoding/json"
	"fmt"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type resultRow map[string]json.RawMessage

func rowsByName(result lithograph.Result) ([]resultRow, error) {
	rows := make([]resultRow, 0, len(result.Rows))
	for rowIndex, values := range result.Rows {
		if len(values) != len(result.Columns) {
			return nil, publicError(
				CodeInternal,
				fmt.Sprintf("Lithograph row %d has %d cells for %d columns", rowIndex, len(values), len(result.Columns)),
				nil,
			)
		}
		row := make(resultRow, len(result.Columns))
		for index, name := range result.Columns {
			row[name] = values[index]
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func rawString(row resultRow, name string) (string, error) {
	raw, ok := row[name]
	if !ok {
		return "", publicError(CodeInternal, "Lithograph result is missing "+name, nil)
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", publicError(CodeInternal, "decode Lithograph "+name, err)
	}
	return value, nil
}

func rawBool(row resultRow, name string) (bool, error) {
	raw, ok := row[name]
	if !ok {
		return false, publicError(CodeInternal, "Lithograph result is missing "+name, nil)
	}
	var value bool
	if err := json.Unmarshal(raw, &value); err != nil {
		return false, publicError(CodeInternal, "decode Lithograph "+name, err)
	}
	return value, nil
}

func rawStringList(row resultRow, name string) ([]string, error) {
	raw, ok := row[name]
	if !ok {
		return nil, publicError(CodeInternal, "Lithograph result is missing "+name, nil)
	}
	if string(raw) == "null" {
		return nil, nil
	}
	var value []string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, publicError(CodeInternal, "decode Lithograph "+name, err)
	}
	return value, nil
}

func isNull(row resultRow, name string) bool {
	raw, ok := row[name]
	return !ok || string(raw) == "null"
}
