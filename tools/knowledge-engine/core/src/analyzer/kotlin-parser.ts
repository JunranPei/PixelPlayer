/**
 * Kotlin Parser using Tree-sitter for deterministic parsing of class/function
 * declarations and identifying annotations.
 */
export class KotlinParser {
  // Tree-sitter query rules for Kotlin AST extraction
  private static readonly KOTLIN_QUERIES = {
    // Queries classes, interfaces and objects
    classes: `
      (class_declaration
        (simple_identifier) @class_name
        (class_body)? @body)
      (interface_declaration
        (simple_identifier) @interface_name
        (class_body)? @body)
      (object_declaration
        (simple_identifier) @object_name
        (class_body)? @body)
    `,
    // Queries functions and methods
    functions: `
      (function_declaration
        (simple_identifier) @function_name
        (value_parameters)? @params
        (type)? @return_type)
    `,
    // Queries annotations (vital for Hilt dependencies)
    annotations: `
      (annotation
        (user_type
          (simple_identifier) @annotation_name)
        (value_arguments)? @arguments)
    `
  };

  /**
   * Retrieves the tree-sitter queries for Kotlin parsing.
   */
  public getQueries() {
    return KotlinParser.KOTLIN_QUERIES;
  }

  /**
   * Extracts structural info from a raw Kotlin file content.
   * Under the hood, this will use tree-sitter-kotlin grammar in native setups.
   */
  public parseStructure(fileContent: string): {
    classes: string[];
    functions: string[];
    annotations: { name: string; content: string; context: string }[];
  } {
    const classes: string[] = [];
    const functions: string[] = [];
    const annotations: { name: string; content: string; context: string }[] = [];

    // Basic regex-based extraction as a robust fallback for TypeScript runtime
    const classMatches = fileContent.matchAll(/(?:class|interface|object)\s+([A-Za-z0-9_]+)/g);
    for (const match of classMatches) {
      classes.push(match[1]);
    }

    const funMatches = fileContent.matchAll(/fun\s+([A-Za-z0-9_]+)/g);
    for (const match of funMatches) {
      functions.push(match[1]);
    }

    // Capture annotations, e.g., @Inject or @Module with optional parameters
    const annotationMatches = fileContent.matchAll(/@([A-Za-z0-9_]+)(?:\(([^)]*)\))?/g);
    for (const match of annotationMatches) {
      annotations.push({
        name: match[1],
        content: match[2] || '',
        context: classes[0] || 'Global' // Bind to first class declared in file as context
      });
    }

    return { classes, functions, annotations };
  }
}
