export interface HiltDependencyEdge {
  fromComponent: string;
  toComponent: string;
  relationship: 'injects' | 'provides' | 'binds' | 'installs_in';
}

/**
 * Parses Hilt Dependency Injection annotations using AST metadata
 * to establish architectural boundaries and dependency lines.
 */
export class HiltMapper {
  /**
   * Maps Hilt dependency edges based on identified annotations.
   * Analyzes patterns like @Inject, @Module, @InstallIn, @Provides, and @Binds.
   */
  public mapDependencies(annotations: { name: string; content: string; context: string }[]): HiltDependencyEdge[] {
    const edges: HiltDependencyEdge[] = [];

    let currentModule = '';
    let installedInComponent = '';

    for (const ann of annotations) {
      if (ann.name === 'Module') {
        currentModule = ann.context; // Name of class annotated with @Module
      }
      if (ann.name === 'InstallIn' && currentModule) {
        // Extract component name, e.g., SingletonComponent::class or ActivityComponent
        const match = ann.content.match(/([A-Za-z0-9_]+Component)/);
        installedInComponent = match ? match[1] : 'UnknownComponent';
        edges.push({
          fromComponent: currentModule,
          toComponent: installedInComponent,
          relationship: 'installs_in'
        });
      }
      if ((ann.name === 'Provides' || ann.name === 'Binds') && currentModule) {
        // Method inside module providing a dependency
        const targetType = ann.content.match(/:\s*([A-Za-z0-9_<>]+)/)?.[1] || 'UnknownType';
        edges.push({
          fromComponent: currentModule,
          toComponent: targetType,
          relationship: ann.name === 'Provides' ? 'provides' : 'binds'
        });
      }
      if (ann.name === 'Inject') {
        // Constructor or field injection
        const injectedIn = ann.context;
        const injectedType = ann.content.match(/:\s*([A-Za-z0-9_<>]+)/)?.[1] || 'UnknownType';
        edges.push({
          fromComponent: injectedType,
          toComponent: injectedIn,
          relationship: 'injects'
        });
      }
    }

    return edges;
  }
}
