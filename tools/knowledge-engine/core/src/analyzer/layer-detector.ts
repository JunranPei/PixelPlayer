import * as path from 'path';

export type LayerType = 'Presentation' | 'Wearable' | 'Domain-Shared' | 'Unknown';

export interface DetectedLayer {
  layer: LayerType;
  confidence: number;
  reason: string;
}

export class LayerDetector {
  /**
   * Detects the specific architectural layer of PixelPlayer for a given file path.
   * 
   * @param filePath The file path to analyze (can be absolute or relative).
   * @returns An object containing the detected layer, confidence score, and the reason.
   */
  public detect(filePath: string): DetectedLayer {
    // Normalize path separators for cross-platform compatibility (Windows vs Unix)
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check for App / Presentation layer
    if (/\/app\/(src\/|build\.gradle\.kts$)/i.test(normalizedPath) || normalizedPath.startsWith('app/')) {
      return {
        layer: 'Presentation',
        confidence: 1.0,
        reason: `File matches PixelPlayer Presentation layer path (located within /app/ folder)`
      };
    }

    // Check for Wearable layer
    if (/\/wear\/(src\/|build\.gradle\.kts$)/i.test(normalizedPath) || normalizedPath.startsWith('wear/')) {
      return {
        layer: 'Wearable',
        confidence: 1.0,
        reason: `File matches PixelPlayer Wearable layer path (located within /wear/ folder)`
      };
    }

    // Check for Domain-Shared layer
    if (/\/shared\/(src\/|build\.gradle\.kts$)/i.test(normalizedPath) || normalizedPath.startsWith('shared/')) {
      return {
        layer: 'Domain-Shared',
        confidence: 1.0,
        reason: `File matches PixelPlayer Domain-Shared layer path (located within /shared/ folder)`
      };
    }

    // Fallback detection based on context clues in the file path
    if (normalizedPath.includes('com/theveloper/pixelplay/presentation') || normalizedPath.includes('ui/theme')) {
      return {
        layer: 'Presentation',
        confidence: 0.8,
        reason: `File references presentation packages outside expected folder`
      };
    }

    if (normalizedPath.includes('com/theveloper/pixelplay/data') || normalizedPath.includes('di/')) {
      return {
        layer: 'Domain-Shared',
        confidence: 0.8,
        reason: `File references core data / dependency injection packages`
      };
    }

    return {
      layer: 'Unknown',
      confidence: 0.0,
      reason: 'File path does not match any recognized PixelPlayer module structure'
    };
  }

  /**
   * Returns descriptive names and details for all available layers.
   */
  public getLayersMeta(): Record<LayerType, { name: string; description: string }> {
    return {
      'Presentation': {
        name: 'Presentation Layer',
        description: 'PixelPlayer main mobile app application layer (Jetpack Compose UI, ViewModels, etc.)'
      },
      'Wearable': {
        name: 'Wearable Layer',
        description: 'PixelPlayer Wear OS application layer (Complications, Tile service, specific Wear Compose UI)'
      },
      'Domain-Shared': {
        name: 'Domain-Shared Layer',
        description: 'Core domain models, network repositories, database, shared utils and media services'
      },
      'Unknown': {
        name: 'Unknown Layer',
        description: 'Files outside the recognized module boundary structure'
      }
    };
  }
}
