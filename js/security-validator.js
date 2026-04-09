/**
 * js/security-validator.js
 * ============================================================
 * Validación de seguridad en cliente + servidor
 * - Validación de órdenes
 * - Protección contra inyecciones
 * - Rate limiting local
 * ============================================================
 */

class OrderValidator {
  // Límites de seguridad
  MAX_ORDER_ITEMS = 100;
  MAX_ORDER_TOTAL = 1000000;
  MIN_CUSTOMER_NAME_LENGTH = 3;
  MAX_CUSTOMER_NAME_LENGTH = 255;
  WHATSAPP_REGEX = /^\+?[1-9]\d{1,14}$/;

  /**
   * Validar estructura del carrito
   */
  validateCart(items) {
    const errors = [];

    if (!Array.isArray(items)) {
      errors.push('Items must be an array');
      return errors;
    }

    if (items.length === 0) {
      errors.push('Cart cannot be empty');
      return errors;
    }

    if (items.length > this.MAX_ORDER_ITEMS) {
      errors.push(`Cart cannot have more than ${this.MAX_ORDER_ITEMS} items`);
      return errors;
    }

    // Validar cada item
    items.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        errors.push(`Item ${idx}: Invalid format`);
        return;
      }

      if (!this.isValidUUID(item.id)) {
        errors.push(`Item ${idx}: Invalid product ID format`);
      }

      if (!Number.isInteger(item.qty) || item.qty <= 0 || item.qty > 999) {
        errors.push(`Item ${idx}: Quantity must be between 1 and 999`);
      }

      if (typeof item.price !== 'number' || item.price < 0) {
        errors.push(`Item ${idx}: Invalid price`);
      }
    });

    return errors;
  }

  /**
   * Validar información del cliente
   */
  validateCustomer(customerName, whatsapp) {
    const errors = [];

    if (!customerName || typeof customerName !== 'string') {
      errors.push('Customer name is required');
      return errors;
    }

    const trimmedName = customerName.trim();
    if (trimmedName.length < this.MIN_CUSTOMER_NAME_LENGTH) {
      errors.push(
        `Customer name must be at least ${this.MIN_CUSTOMER_NAME_LENGTH} characters`
      );
    }

    if (trimmedName.length > this.MAX_CUSTOMER_NAME_LENGTH) {
      errors.push(
        `Customer name cannot exceed ${this.MAX_CUSTOMER_NAME_LENGTH} characters`
      );
    }

    // Detectar intentos de inyección SQL/XSS
    if (this.containsSuspiciousPatterns(trimmedName)) {
      errors.push('Customer name contains invalid characters');
    }

    if (!whatsapp || typeof whatsapp !== 'string') {
      errors.push('WhatsApp number is required');
      return errors;
    }

    if (!this.WHATSAPP_REGEX.test(whatsapp.trim())) {
      errors.push('Invalid WhatsApp number format (example: +51987654321)');
    }

    // Máximo 20 caracteres
    if (whatsapp.trim().length > 20) {
      errors.push('WhatsApp number too long');
    }

    return errors;
  }

  /**
   * Validar total calculado
   */
  validateTotal(total) {
    const errors = [];

    if (typeof total !== 'number' || total < 0) {
      errors.push('Order total must be a valid number');
      return errors;
    }

    if (total > this.MAX_ORDER_TOTAL) {
      errors.push(`Order total exceeds maximum ($${this.MAX_ORDER_TOTAL})`);
    }

    if (total === 0) {
      errors.push('Order total must be greater than zero');
    }

    return errors;
  }

  /**
   * Validar payload completo de orden
   */
  validateOrderPayload(orderData) {
    const errors = [];

    if (!orderData) {
      errors.push('Order data is required');
      return errors;
    }

    const { items, customer_name, whatsapp, total, store_id } = orderData;

    // Validar store_id
    if (!this.isValidUUID(store_id)) {
      errors.push('Invalid store ID');
    }

    // Validar items
    errors.push(...this.validateCart(items));

    // Validar cliente
    errors.push(...this.validateCustomer(customer_name, whatsapp));

    // Validar total
    errors.push(...this.validateTotal(total));

    return errors;
  }

  /**
   * Detectar patrones sospechosos (inyección, XSS)
   */
  containsSuspiciousPatterns(input) {
    const suspiciousPatterns = [
      /(<|>|&lt;|&gt;|<script|javascript:|onclick|onerror)/gi, // XSS
      /(["']|--|;|\*|DROP|DELETE|UPDATE|INSERT|SELECT)/gi, // SQL injection
      /(\.\.\/|\.\.\\)/gi // Path traversal
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Validar UUID v4
   */
  isValidUUID(uuid) {
    if (typeof uuid !== 'string') return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
  }

  /**
   * Sanitizar entrada (básico)
   */
  sanitizeString(input, maxLength = 255) {
    if (typeof input !== 'string') return '';

    return input
      .trim()
      .substring(0, maxLength)
      .replace(/[<>]/g, '') // Remover < y >
      .replace(/--/g, '') // Comentarios SQL
      .replace(/;$/g, ''); // Punto y coma final
  }
}

/**
 * ============================================================
 * LocalRateLimit: Rate limiting en cliente
 * ============================================================
 */

class LocalRateLimit {
  constructor() {
    // { endpoint: [timestamps], ... }
    this.requests = new Map();
  }

  /**
   * Verificar si se puede hacer una solicitud
   */
  canMakeRequest(endpoint, maxRequests = 5, windowSeconds = 60) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const timestamps = this.requests.get(endpoint) || [];

    // Filtrar solicitudes fuera de la ventana
    const recentRequests = timestamps.filter((ts) => now - ts < windowMs);

    if (recentRequests.length >= maxRequests) {
      return false;
    }

    // Registrar solicitud actual
    recentRequests.push(now);
    this.requests.set(endpoint, recentRequests);

    return true;
  }

  /**
   * Obtener tiempo de espera hasta próxima solicitud
   */
  getWaitTime(endpoint, windowSeconds = 60) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const timestamps = this.requests.get(endpoint) || [];

    if (timestamps.length === 0) return 0;

    const oldestRecentRequest = timestamps[0];
    const elapsedSinceOldest = now - oldestRecentRequest;
    const waitTime = Math.max(0, windowMs - elapsedSinceOldest);

    return Math.ceil(waitTime / 1000); // Retornar en segundos
  }

  /**
   * Resetear límites para un endpoint
   */
  reset(endpoint) {
    this.requests.delete(endpoint);
  }

  /**
   * Limpiar solicitudes antiguas
   */
  cleanup(windowSeconds = 300) {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;

    for (const [endpoint, timestamps] of this.requests.entries()) {
      const recentRequests = timestamps.filter((ts) => now - ts < windowMs);
      if (recentRequests.length === 0) {
        this.requests.delete(endpoint);
      } else {
        this.requests.set(endpoint, recentRequests);
      }
    }
  }
}

/**
 * ============================================================
 * ErrorHandler: Manejo global de errores en seguridad
 * ============================================================
 */

class SecurityErrorHandler {
  constructor(isProduction = true) {
    this.isProduction = isProduction;
    this.errorLog = [];
    this.maxLogSize = 100;
  }

  /**
   * Capturar error de Supabase
   */
  handleSupabaseError(error, context = {}) {
    console.error('🔴 Supabase Security Error:', error);

    this.logError({
      type: 'supabase',
      message: error.message,
      code: error.code,
      context,
      timestamp: new Date()
    });

    // Mapeo de errores específicos
    const errorMap = {
      'PGRST116': 'This record does not exist or you do not have access to it',
      'PGRST110': 'You do not have permission to access this resource',
      'PGRST301': 'Failed to create record',
      'PGRST302': 'Failed to update record',
      '413': 'File too large',
      '429': 'Rate limit exceeded. Please try again later'
    };

    const userMessage = errorMap[error.code] || 'An error occurred. Please try again.';

    return {
      userMessage,
      isSecurityError: error.code?.includes('110') || error.code?.includes('116'),
      shouldRetry: error.code?.includes('429')
    };
  }

  /**
   * Capturar error de validación
   */
  handleValidationError(errors, context = {}) {
    console.warn('⚠️  Validation Error:', errors);

    this.logError({
      type: 'validation',
      message: errors.join('; '),
      context,
      timestamp: new Date()
    });

    // Retornar primer error al usuario
    return {
      userMessage: errors[0],
      allErrors: errors
    };
  }

  /**
   * Registrar evento de seguridad sospechoso
   */
  logSuspiciousActivity(activity, context = {}) {
    const event = {
      type: 'suspicious_activity',
      activity,
      context,
      timestamp: new Date(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    console.warn('🚨 Suspicious Activity Detected:', event);
    this.logError(event);

    // Si hay demasiadas actividades sospechosas, enviar alerta
    const recentSuspicious = this.errorLog.filter(
      (log) =>
        log.type === 'suspicious_activity' &&
        Date.now() - new Date(log.timestamp).getTime() < 300000 // últimos 5 min
    );

    if (recentSuspicious.length > 5) {
      this.flushErrorLog();
    }
  }

  /**
   * Registrar error interno
   */
  logError(errorObj) {
    this.errorLog.push(errorObj);

    // Mantener tamaño bajo
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Enviar a servidor si hay muchos errores
    if (this.errorLog.length > 20) {
      this.flushErrorLog();
    }
  }

  /**
   * Enviar logs al servidor
   */
  async flushErrorLog() {
    if (this.errorLog.length === 0) return;

    try {
      console.log(`📨 Sending ${this.errorLog.length} error logs to server...`);

      // Hacer POST a un endpoint seguro
      await fetch('/api/logs/security-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          events: this.errorLog,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        })
      }).catch((e) => {
        // Fallar silenciosamente si no hay conectividad
        console.warn('Failed to send logs:', e);
      });

      this.errorLog = [];
    } catch (error) {
      console.error('Error flushing logs:', error);
    }
  }

  /**
   * Verificar si hay anomalía
   */
  detectAnomaly() {
    const recentErrors = this.errorLog.filter(
      (log) => Date.now() - new Date(log.timestamp).getTime() < 60000 // último minuto
    );

    const securityErrors = recentErrors.filter(
      (log) => log.type === 'supabase' && log.code?.includes('110')
    );

    const suspiciousActivities = recentErrors.filter(
      (log) => log.type === 'suspicious_activity'
    );

    return {
      hasAnomaly: securityErrors.length > 3 || suspiciousActivities.length > 5,
      securityErrors: securityErrors.length,
      suspiciousActivities: suspiciousActivities.length
    };
  }
}

// ============================================================
// INSTANCIAS GLOBALES
// ============================================================

const orderValidator = new OrderValidator();
const localRateLimit = new LocalRateLimit();
const securityErrorHandler = new SecurityErrorHandler(!DEV_MODE);

// Limpiar rate limits cada 5 minutos
setInterval(() => {
  localRateLimit.cleanup();
}, 5 * 60 * 1000);

// ============================================================
// EXPORTAR
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OrderValidator,
    LocalRateLimit,
    SecurityErrorHandler
  };
}
