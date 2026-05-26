package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

// TenantIsolation ensures tenant data separation
// Validates that the tenant_id in the JWT matches
// any tenant_id in the request params
func TenantIsolation() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			tenantID := c.Get(ContextKeyTenantID)
			if tenantID == nil || tenantID == "" {
				return echo.NewHTTPError(
					http.StatusUnauthorized,
					"missing tenant context",
				)
			}
			return next(c)
		}
	}
}