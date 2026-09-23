package kernel

import (
	"context"
	"fmt"

	"github.com/bYiyLi/kg-os/internal/lithograph"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

type Service struct {
	database         *lithograph.Host
	fullTextAnalyzer string
	semantic         runtimeprofile.SemanticDefaults
}

func Open(
	ctx context.Context,
	database *lithograph.Host,
	fullTextAnalyzer string,
	semantic runtimeprofile.SemanticDefaults,
) (*Service, error) {
	if database == nil {
		return nil, fmt.Errorf("kernel database is required")
	}
	service := &Service{
		database:         database,
		fullTextAnalyzer: fullTextAnalyzer,
		semantic:         semantic,
	}
	if err := service.bootstrapOrValidate(ctx); err != nil {
		return nil, err
	}
	return service, nil
}
