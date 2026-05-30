export interface ExtractorConfig {
  languages: {
    kotlin: {
      enabled: boolean;
      parser: string;
      useTreeSitter: boolean;
      mappings: {
        classes: boolean;
        functions: boolean;
        hilt: boolean;
      };
    };
  };
  exclude: string[];
}

export const defaultExtractorConfig: ExtractorConfig = {
  languages: {
    kotlin: {
      enabled: true,
      parser: 'tree-sitter-kotlin',
      useTreeSitter: true,
      mappings: {
        classes: true,
        functions: true,
        hilt: true
      }
    }
  },
  exclude: [
    '**/build/**',
    '**/.gradle/**',
    '**/node_modules/**',
    '**/.git/**',
    '**/*_Impl.*',
    '**/*_Factory.*',
    '**/*_MembersInjector.*',
    '**/*_HiltModules*'
  ]
};
