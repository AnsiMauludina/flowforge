package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
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

type JWTClaims struct {
	UserID   string     `json:"user_id"`
	TenantID string     `json:"tenant_id"`
	Email    string     `json:"email"`
	Role     model.Role `json:"role"`
	jwt.RegisteredClaims
}

func NewJWTMiddleware(cfg JWTConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing authorization header",
			})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid authorization format",
			})
			return
		}

		claims, err := parseToken(parts[1], cfg.Secret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid or expired token",
			})
			return
		}

		c.Set(ContextKeyUserID, claims.UserID)
		c.Set(ContextKeyTenantID, claims.TenantID)
		c.Set(ContextKeyRole, claims.Role)
		c.Set(ContextKeyEmail, claims.Email)

		c.Next()
	}
}

func RequireRole(roles ...model.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRole, exists := c.Get(ContextKeyRole)
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing role",
			})
			return
		}

		role, ok := userRole.(model.Role)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid role",
			})
			return
		}

		for _, r := range roles {
			if role == r {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "insufficient permissions",
		})
	}
}

func TenantIsolation() gin.HandlerFunc {
	return func(c *gin.Context) {
		tenantID, exists := c.Get(ContextKeyTenantID)
		if !exists || tenantID == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing tenant context",
			})
			return
		}
		c.Next()
	}
}

func GenerateToken(
	userID, tenantID, email string,
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

func parseToken(tokenString, secret string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(
		tokenString,
		&JWTClaims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return []byte(secret), nil
		},
	)
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*JWTClaims)
	if !ok || !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}
	return claims, nil
}

// Context helpers
func GetUserID(c *gin.Context) string {
	val, _ := c.Get(ContextKeyUserID)
	str, _ := val.(string)
	return str
}

func GetTenantID(c *gin.Context) string {
	val, _ := c.Get(ContextKeyTenantID)
	str, _ := val.(string)
	return str
}

func GetRole(c *gin.Context) model.Role {
	val, _ := c.Get(ContextKeyRole)
	role, _ := val.(model.Role)
	return role
}