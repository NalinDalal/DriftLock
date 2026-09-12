import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import JavaScript from 'tree-sitter-javascript';
import { CallSite } from '@driftlock/core';

export interface ExtractionResult {
  callSites: CallSite[];
  errors: Array<{
    file: string;
    line: number;
    message: string;
  }>;
}

export class TypeScriptExtractor {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(TypeScript.typescript);
  }

  async extractFromFile(filePath: string, content: string): Promise<ExtractionResult> {
    const tree = this.parser.parse(content);
    const callSites: CallSite[] = [];
    const errors: Array<{ file: string; line: number; message: string }> = [];

    this.walkTree(tree.rootNode, callSites, errors, filePath);

    return { callSites, errors };
  }

  private walkTree(
    node: Parser.SyntaxNode,
    callSites: CallSite[],
    errors: Array<{ file: string; line: number; message: string }>,
    filePath: string
  ): void {
    if (node.type === 'call_expression') {
      this.extractCallExpression(node, callSites, errors, filePath);
    }

    for (const child of node.children) {
      this.walkTree(child, callSites, errors, filePath);
    }
  }

  private extractCallExpression(
    node: Parser.SyntaxNode,
    callSites: CallSite[],
    errors: Array<{ file: string; line: number; message: string }>,
    filePath: string
  ): void {
    try {
      const callee = node.child(0);
      if (!callee || callee.type !== 'member_expression') {
        return;
      }

      // Check if this is a stripe.* call
      if (!this.isStripeCall(callee)) {
        return;
      }

      const method = this.extractMethodName(callee);
      const endpoint = this.mapMethodToEndpoint(method);
      const httpMethod = this.mapMethodToHttpMethod(method);
      const requestShape = this.extractRequestShape(node);
      const responseFields = this.extractResponseFields(node);

      callSites.push({
        id: this.generateId(filePath, node.startPosition.row, method),
        repositoryId: '', // Will be set by caller
        filePath,
        line: node.startPosition.row + 1,
        method,
        endpoint,
        httpMethod,
        requestShape,
        responseFields,
        testFiles: [],
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      errors.push({
        file: filePath,
        line: node.startPosition.row + 1,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private isStripeCall(node: Parser.SyntaxNode): boolean {
    // Check for stripe.charges.create, stripe.customers.retrieve, etc.
    const text = node.text;
    return text.startsWith('stripe.');
  }

  private extractMethodName(node: Parser.SyntaxNode): string {
    // Extract the full method path: stripe.charges.create
    return node.text;
  }

  private mapMethodToEndpoint(method: string): string {
    // Map Stripe SDK methods to API endpoints
    const mapping: Record<string, string> = {
      'stripe.charges.create': '/v1/charges',
      'stripe.charges.retrieve': '/v1/charges/:id',
      'stripe.charges.list': '/v1/charges',
      'stripe.charges.update': '/v1/charges/:id',
      'stripe.customers.create': '/v1/customers',
      'stripe.customers.retrieve': '/v1/customers/:id',
      'stripe.customers.list': '/v1/customers',
      'stripe.customers.update': '/v1/customers/:id',
      'stripe.invoices.create': '/v1/invoices',
      'stripe.invoices.retrieve': '/v1/invoices/:id',
      'stripe.invoices.list': '/v1/invoices',
      'stripe.invoices.update': '/v1/invoices/:id',
    };

    return mapping[method] || `/v1/unknown`;
  }

  private mapMethodToHttpMethod(method: string): 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' {
    if (method.includes('.create')) return 'POST';
    if (method.includes('.retrieve')) return 'GET';
    if (method.includes('.list')) return 'GET';
    if (method.includes('.update')) return 'POST';
    if (method.includes('.delete')) return 'DELETE';
    return 'GET';
  }

  private extractRequestShape(node: Parser.SyntaxNode): Record<string, unknown> {
    // Extract the first argument (request body/params)
    const args = node.child(1); // arguments node
    if (!args || args.type !== 'arguments') {
      return {};
    }

    const firstArg = args.child(1); // Skip opening paren
    if (!firstArg || firstArg.type !== 'object') {
      return {};
    }

    // Parse object properties
    const shape: Record<string, unknown> = {};
    this.extractObjectProperties(firstArg, shape);
    return shape;
  }

  private extractObjectProperties(node: Parser.SyntaxNode, shape: Record<string, unknown>): void {
    for (const child of node.children) {
      if (child.type === 'property') {
        const key = child.child(0)?.text || '';
        const value = child.child(2);
        if (key && value) {
          shape[key] = this.inferType(value);
        }
      }
    }
  }

  private inferType(node: Parser.SyntaxNode): string {
    switch (node.type) {
      case 'string':
        return 'string';
      case 'number':
        return 'number';
      case 'true':
      case 'false':
        return 'boolean';
      case 'null':
        return 'null';
      case 'object':
        return 'object';
      case 'array':
        return 'array';
      default:
        return 'unknown';
    }
  }

  private extractResponseFields(node: Parser.SyntaxNode): string[] {
    // This would require more sophisticated analysis
    // For now, return empty array
    return [];
  }

  private generateId(filePath: string, line: number, method: string): string {
    // Generate a unique ID for the call site
    return `${filePath}:${line}:${method}`.replace(/[^a-zA-Z0-9]/g, '_');
  }
}
