package webstore

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func NewID() string {
	var value [16]byte
	// Go's crypto/rand.Read fills the buffer or terminates the process.
	_, _ = rand.Read(value[:])
	value[6] = value[6]&0x0f | 0x40
	value[8] = value[8]&0x3f | 0x80
	raw := hex.EncodeToString(value[:])
	return raw[:8] + "-" + raw[8:12] + "-" + raw[12:16] + "-" + raw[16:20] + "-" + raw[20:]
}

func validID(value string) bool {
	if len(value) != 36 || value != strings.ToLower(value) {
		return false
	}
	for index, character := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			if character != '-' {
				return false
			}
		} else if !(character >= '0' && character <= '9' || character >= 'a' && character <= 'f') {
			return false
		}
	}
	return true
}

func validKind(kind string) bool {
	switch kind {
	case "workspace", "editor", "frame", "query", "draft":
		return true
	default:
		return false
	}
}

func publicError(code kernel.ErrorCode, message string, cause error) *kernel.PublicError {
	return &kernel.PublicError{Code: code, Message: message, Cause: cause}
}

func invalid(message string) error { return publicError(kernel.CodeInvalidArgument, message, nil) }
func ioError(err error) error      { return publicError(kernel.CodeIO, "Web storage I/O failed", err) }
func consistency(err error) error {
	return publicError(kernel.CodeConsistency, "Web storage is inconsistent", err)
}
func resource() error {
	return publicError(kernel.CodeResource, "Web storage budget was exceeded", nil)
}

func validateKey(input ReadRequest) error {
	if !validID(input.StoreID) || !validID(input.ID) || !validKind(input.Kind) {
		return invalid("Web record requires a storeId, supported kind, and UUID id")
	}
	return nil
}

func validRevision(value string) bool {
	if value == "" || value[0] == '0' || len(value) > 128 {
		return false
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func nextRevision(value string) string {
	current := new(big.Int)
	current.SetString(value, 10)
	return current.Add(current, big.NewInt(1)).String()
}

func validateMutation(input ReadRequest, revision *string, mutation string) error {
	if err := validateKey(input); err != nil {
		return err
	}
	if !validID(mutation) || revision != nil && !validRevision(*revision) {
		return invalid("Web mutation requires a UUID mutationId and decimal expectedRevision")
	}
	return nil
}

func validateData(kind string, data json.RawMessage) error {
	if len(data) > RecordLimit {
		return resource()
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var object map[string]any
	if err := decoder.Decode(&object); err != nil || object == nil || !json.Valid(data) {
		return invalid("Web record data must be a versioned JSON object")
	}
	if object["version"] != json.Number("1") {
		return invalid("Web record payload version must be 1")
	}
	if kind == "draft" {
		switch object["subtype"] {
		case "object", "merge", "state-data":
		default:
			return invalid("Web draft subtype is invalid")
		}
	}
	if kind != "frame" {
		return nil
	}
	var frame frameData
	if err := json.Unmarshal(data, &frame); err != nil || frame.Params == nil || frame.Closed == nil || frame.Statement == nil {
		return invalid("Web frame requires statement, params, mode, status, and closed")
	}
	if _, present := object["paramsText"]; present && frame.ParamsText == nil {
		return invalid("Web frame paramsText must be a String")
	}
	if _, err := frame.parameters(); err != nil {
		return err
	}
	if frame.Mode != "query" && frame.Mode != "execute" {
		return invalid("Web frame mode is invalid")
	}
	switch frame.Status {
	case "queued", "running", "complete", "cancelled", "partial", "failed", "unknown":
	default:
		return invalid("Web frame status is invalid")
	}
	return nil
}

type frameData struct {
	Mode        string                     `json:"mode"`
	Statement   *string                    `json:"statement"`
	Params      map[string]json.RawMessage `json:"params"`
	ParamsText  *string                    `json:"paramsText"`
	ReadState   string                     `json:"readState"`
	ResultState string                     `json:"resultState"`
	Status      string                     `json:"status"`
	Closed      *bool                      `json:"closed"`
}

func (frame frameData) parameters() (map[string]json.RawMessage, error) {
	if frame.ParamsText == nil {
		return frame.Params, nil
	}
	var params map[string]json.RawMessage
	if err := json.Unmarshal([]byte(*frame.ParamsText), &params); err != nil || params == nil {
		return nil, invalid("Web frame paramsText must encode a JSON object")
	}
	return params, nil
}

func changed(kind, id string, record *Record) error {
	details := map[string]any{"kind": kind, "id": id}
	if record != nil {
		details["revision"] = record.Revision
		details["deleted"] = record.Deleted
	}
	return &kernel.PublicError{Code: CodeChanged, Message: "Web record or store changed", Details: details}
}

func recordMissing(kind, id string) error {
	return &kernel.PublicError{Code: CodeNotFound, Message: "Web record was not found", Details: map[string]any{"kind": kind, "id": id}}
}

func unsupported(version int) error {
	return publicError(kernel.CodeUnsupportedOperation, fmt.Sprintf("Web storage format %d is unsupported", version), nil)
}
