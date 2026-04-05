/**
 * js/image-optimizer.js
 * ============================================================
 * Optimizador de imágenes para producción
 * - Compresión automática a WebP
 * - Redimensionamiento inteligente
 * - Generación de múltiples variantes
 * - Deduplicación con hash SHA-256
 * ============================================================
 */

class ImageOptimizer {
  constructor(options = {}) {
    // Configuración
    this.maxWidth = options.maxWidth || 1920;
    this.maxHeight = options.maxHeight || 1440;
    this.maxFileSize = options.maxFileSize || 5 * 1024 * 1024; // 5MB

    // Calidad por tipo de variante
    this.qualityLevels = {
      thumbnail: 0.6,  // Pequeña, archivo ligero
      preview: 0.75,   // Mediana, balance
      full: 0.85       // Completa, máxima calidad
    };

    // Tipos permitidos
    this.allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

    // Almacenamiento en caché local
    this.cache = new Map();
  }

  /**
   * Validar archivo antes de procesar
   * @throws {Error} Si el archivo no es válido
   */
  validateFile(file) {
    if (!file) {
      throw new Error('No file provided');
    }

    if (!this.allowedMimes.includes(file.type)) {
      throw new Error(
        `Invalid file type: ${file.type}. Allowed: ${this.allowedMimes.join(', ')}`
      );
    }

    if (file.size > this.maxFileSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      const maxMB = (this.maxFileSize / 1024 / 1024).toFixed(0);
      throw new Error(`File size (${sizeMB}MB) exceeds limit (${maxMB}MB)`);
    }

    return true;
  }

  /**
   * Cargar imagen desde File y convertir a Image
   * @private
   */
  async loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target.result;
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Redimensionar y convertir a WebP
   * @private
   */
  async resizeAndConvertToWebP(img, quality) {
    return new Promise((resolve, reject) => {
      try {
        // Calcular dimensiones manteniendo aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > this.maxWidth || height > this.maxHeight) {
          const ratio = Math.min(
            this.maxWidth / width,
            this.maxHeight / height
          );
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);
        }

        // Crear canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }

        // Fondo blanco para compatibilidad
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, width, height);

        // Dibujar imagen
        ctx.drawImage(img, 0, 0, width, height);

        // Convertir a WebP
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to create blob'));
            } else {
              resolve(blob);
            }
          },
          'image/webp',
          quality
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generar múltiples variantes de la imagen
   * Retorna: { thumbnail, preview, full }
   */
  async generateVariants(file) {
    try {
      this.validateFile(file);

      // Cargar imagen
      const img = await this.loadImageFromFile(file);

      // Convertir a las 3 variantes
      console.log('🖼️  Generating image variants...');

      const [thumbnail, preview, full] = await Promise.all([
        this.resizeAndConvertToWebP(img, this.qualityLevels.thumbnail),
        this.resizeAndConvertToWebP(img, this.qualityLevels.preview),
        this.resizeAndConvertToWebP(img, this.qualityLevels.full)
      ]);

      return { thumbnail, preview, full };
    } catch (error) {
      throw new Error(`Failed to generate variants: ${error.message}`);
    }
  }

  /**
   * Calcular hash SHA-256 del blob (para deduplicación)
   */
  async calculateHash(blob) {
    try {
      const buffer = await blob.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      throw new Error(`Failed to calculate hash: ${error.message}`);
    }
  }

  /**
   * Obtener información de escalabilidad de la imagen
   */
  async getImageDimensions(file) {
    try {
      const img = await this.loadImageFromFile(file);
      return {
        width: img.width,
        height: img.height,
        ratio: img.width / img.height
      };
    } catch (error) {
      throw new Error(`Failed to get image dimensions: ${error.message}`);
    }
  }

  /**
   * Limpiar caché
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * ============================================================
 * StorageImageHelper: Generador de URLs con transformaciones
 * ============================================================
 */

class StorageImageHelper {
  constructor(storageUrl = '') {
    // Obtener URL base de Supabase Storage desde config
    if (!storageUrl && typeof window !== 'undefined' && window.SUPABASE_URL) {
      this.baseUrl = `${window.SUPABASE_URL}/storage/v1/object/public`;
    } else {
      this.baseUrl = storageUrl;
    }

    this.bucket = 'product-images';
  }

  /**
   * Generar URL de imagen con transformaciones
   * @param {string} path - Ruta en storage (ej: "stores/uuid/products/full/hash.webp")
   * @param {Object} options - Opciones de transformación
   */
  getImageUrl(path, options = {}) {
    const {
      width = null,
      height = null,
      resize = 'contain', // cover|contain|fill
      quality = 85,
      format = 'webp'
    } = options;

    let url = `${this.baseUrl}/${this.bucket}/${path}`;

    const params = new URLSearchParams();
    if (width) params.append('width', width);
    if (height) params.append('height', height);
    if (resize) params.append('resize', resize);
    if (quality) params.append('quality', quality);
    if (format) params.append('format', format);

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    return url;
  }

  /**
   * Generar URLs de múltiples variantes
   */
  getVariantUrls(hash, storeId) {
    return {
      thumbnail: this.getImageUrl(
        `stores/${storeId}/products/thumbnails/${hash}.webp`,
        { width: 200, height: 200, resize: 'cover', quality: 60 }
      ),
      preview: this.getImageUrl(
        `stores/${storeId}/products/preview/${hash}.webp`,
        { width: 600, height: 400, resize: 'contain', quality: 75 }
      ),
      full: this.getImageUrl(
        `stores/${storeId}/products/full/${hash}.webp`,
        { width: 1920, height: 1440, resize: 'contain', quality: 85 }
      )
    };
  }

  /**
   * Generar HTML de picture element responsivo
   */
  generateResponsiveHtml(hash, storeId, altText = 'Product Image', className = '') {
    const thumbUrl = this.getImageUrl(
      `stores/${storeId}/products/thumbnails/${hash}.webp`,
      { width: 200, height: 200, resize: 'cover' }
    );

    const previewUrl = this.getImageUrl(
      `stores/${storeId}/products/preview/${hash}.webp`,
      { width: 600, height: 400, resize: 'contain' }
    );

    const fullUrl = this.getImageUrl(
      `stores/${storeId}/products/full/${hash}.webp`,
      { width: 1920, height: 1440, resize: 'contain' }
    );

    return `
      <picture>
        <source 
          media="(min-width: 1024px)" 
          srcset="${previewUrl} 1x, ${fullUrl} 2x"
          type="image/webp"
        />
        <source 
          media="(max-width: 1023px)" 
          srcset="${thumbUrl} 1x, ${previewUrl} 2x"
          type="image/webp"
        />
        <img 
          src="${previewUrl}" 
          alt="${altText}" 
          loading="lazy"
          decoding="async"
          ${className ? `class="${className}"` : ''}
        />
      </picture>
    `;
  }

  /**
   * Generar URL firmada (privada)
   * Nota: Requiere Supabase SDK y llamada a backend
   */
  async getSignedUrl(path, expiresIn = 3600) {
    if (!window.supabase) {
      throw new Error('Supabase SDK not initialized');
    }

    const { data, error } = await window.supabase
      .storage
      .from(this.bucket)
      .createSignedUrl(path, expiresIn);

    if (error) throw new Error(`Failed to create signed URL: ${error.message}`);
    return data.signedUrl;
  }
}

/**
 * ============================================================
 * ImagePerformanceMonitor: Monitorear performance
 * ============================================================
 */

class ImagePerformanceMonitor {
  constructor() {
    this.metrics = [];
  }

  /**
   * Medir tiempo de carga de imagen
   */
  measureImageLoad(url, context = {}) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      const img = new Image();

      const handleComplete = (status) => {
        const loadTime = performance.now() - startTime;
        const sizeMB = (new Blob([url]).size / 1024 / 1024).toFixed(2);

        this.logMetric({
          url,
          loadTime,
          status,
          timestamp: new Date(),
          context
        });

        resolve({ loadTime, status });
      };

      img.onload = () => handleComplete('success');
      img.onerror = () => handleComplete('failed');
      img.onabort = () => handleComplete('aborted');

      // Timeout después de 30 segundos
      setTimeout(() => {
        if (img.complete === false) {
          handleComplete('timeout');
        }
      }, 30000);

      img.src = url;
    });
  }

  /**
   * Registrar métrica
   */
  logMetric(metric) {
    this.metrics.push(metric);

    // Enviar a analytics (Google Analytics)
    if (typeof gtag !== 'undefined') {
      gtag('event', 'image_load', {
        'image_url': metric.url,
        'load_time_ms': metric.loadTime,
        'status': metric.status
      });
    }

    // Enviar a Sentry si está disponible
    if (typeof Sentry !== 'undefined' && metric.status === 'failed') {
      Sentry.captureMessage(`Image load failed: ${metric.url}`, 'warning');
    }
  }

  /**
   * Obtener estadísticas agregadas
   */
  getStats() {
    if (this.metrics.length === 0) {
      return {
        totalLoads: 0,
        successful: 0,
        failed: 0,
        avgLoadTime: 0,
        successRate: 0
      };
    }

    const successful = this.metrics.filter((m) => m.status === 'success');
    const failed = this.metrics.filter((m) => m.status === 'failed');
    const avgLoadTime =
      successful.length > 0
        ? successful.reduce((sum, m) => sum + m.loadTime, 0) / successful.length
        : 0;

    return {
      totalLoads: this.metrics.length,
      successful: successful.length,
      failed: failed.length,
      avgLoadTime: parseFloat(avgLoadTime.toFixed(2)),
      successRate: parseFloat(
        ((successful.length / this.metrics.length) * 100).toFixed(2)
      )
    };
  }

  /**
   * Obtener métricas por contexto (ej: por página)
   */
  getStatsByContext() {
    const grouped = {};

    this.metrics.forEach((metric) => {
      const ctx = metric.context.page || 'unknown';
      if (!grouped[ctx]) {
        grouped[ctx] = [];
      }
      grouped[ctx].push(metric);
    });

    const stats = {};
    Object.entries(grouped).forEach(([context, metrics]) => {
      const successful = metrics.filter((m) => m.status === 'success');
      stats[context] = {
        count: metrics.length,
        avg: parseFloat(
          (metrics.reduce((sum, m) => sum + m.loadTime, 0) / metrics.length).toFixed(2)
        ),
        successRate: parseFloat(
          ((successful.length / metrics.length) * 100).toFixed(2)
        )
      };
    });

    return stats;
  }

  /**
   * Limpiar métricas antiguas (más de X minutos)
   */
  cleanup(minutesThreshold = 60) {
    const now = Date.now();
    const threshold = minutesThreshold * 60 * 1000;

    this.metrics = this.metrics.filter((m) => {
      return now - m.timestamp.getTime() < threshold;
    });
  }
}

// ============================================================
// EXPORTAR GLOBALMENTE (si se usa como módulo)
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ImageOptimizer,
    StorageImageHelper,
    ImagePerformanceMonitor
  };
}
