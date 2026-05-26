package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/AnsiMauludina/flowforge/internal/model"
)

const (
	ContextKeyUserID   = "user_id"
	ContextKeyTenantID = "tenant_id"
	ContextKeyRole     = "role"
	ContextKeyEmail    = "email"
)

type JWTConfig struct {
	Secret string
}

// JWTClaims extends jwt.RegisteredClaims
type JWTClaims struct {
	UserID   string     `json:"user_id"`
	TenantID string     `json:"tenant_id"`
	Email    string     `json:"email"`
	Role     model.Role `json:"role"`
	jwt.RegisteredClaims
}

// NewJWTMiddleware returns JWT auth middleware
func NewJWTMiddleware(cfg JWTConfig) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Extract token from Authorization header
			authHeader := c.Request().Header.Get("Authorization")
			if authHeader == "" {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing authorization header")
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid authorization format")
			}

			tokenString := parts[1]

			// Parse and validate token
			claims, err := parseToken(tokenString, cfg.Secret)
			if err != nil {
				return echo.NewHTTPError(http.StatusUnauthorized, "invalid or expired token")
			}

			// Store claims in context
			c.Set(ContextKeyUserID, claims.UserID)
			c.Set(ContextKeyTenantID, claims.TenantID)
			c.Set(ContextKeyRole, claims.Role)
			c.Set(ContextKeyEmail, claims.Email)

			return next(c)
		}
	}
}

// RequireRole returns middleware that checks user role
func RequireRole(roles ...model.Role) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			userRole, ok := c.Get(ContextKeyRole).(model.Role)
			if !ok {
				return echo.NewHTTPError(http.StatusUnauthorized, "missing role")
			}

			for _, role := range roles {
				if userRole == role {
					return next(c)
				}
			}

			return echo.NewHTTPError(http.StatusForbidden,
				"insufficient permissions")
		}
	}
}

// GenerateToken creates a new JWT token
func GenerateToken(
	userID string,
	tenantID string,
	email string,
	role model.Role,
	secret string,
) (string, error) {
	claims := &JWTClaims{
		UserID:   userID,
		TenantID: tenantID,
		Email:    email,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "flowforge",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

func parseToken(tokenString string, secret string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&JWTClaims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, echo.NewHTTPError(
					http.StatusUnauthorized,
					"unexpected signing method",
				)
			}
			return []byte(secret), nil
		},
	)

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "invalid token")
	}

	return claims, nil
}

// GetUserID extracts user ID from context
func GetUserID(c echo.Context) string {
	return c.Get(ContextKeyUserID).(string)
}

// GetTenantID extracts tenant ID from context
func GetTenantID(c echo.Context) string {
	return c.Get(ContextKeyTenantID).(string)
}

// GetRole extracts role from context
func GetRole(c echo.Context) model.Role {
	return c.Get(ContextKeyRole).(model.Role)
}