/**
 * AST-based Java code analysis utilities using java-ast library.
 * Provides robust test method detection without fragile regex patterns.
 */

import { parse, createVisitor } from 'java-ast';

export interface TestMethod {
    methodName: string;
    line: number;
    column: number;
    annotations: string[];
}

export interface MainMethod {
    methodName: string;
    line: number;
    column: number;
}

/**
 * Detects test methods in Java source code using AST parsing.
 * Supports multiple test frameworks: JUnit 4, JUnit 5, TestNG.
 */
export class JavaAstAnalyzer {
    private static readonly TEST_ANNOTATIONS = new Set([
        'Test',
        'ParameterizedTest', 
        'RepeatedTest',
        'TestTemplate',
        'TestFactory',
        'DisplayName',
        'Timeout',
        // TestNG annotations
        'org.testng.annotations.Test',
        // Shortened versions
        'org.junit.Test',
        'org.junit.jupiter.api.Test',
        'org.junit.jupiter.params.ParameterizedTest',
        'org.junit.jupiter.api.RepeatedTest'
    ]);

    /**
     * Finds all test methods in Java source code.
     * @param sourceCode Java source code as string
     * @returns Array of TestMethod objects
     */
    public static findTestMethods(sourceCode: string): TestMethod[] {
        try {
            const ast = parse(sourceCode);
            const testMethods: TestMethod[] = [];

            const visitor = createVisitor({
                visitClassBodyDeclaration: (ctx: any): void => {
                    const methodInfo = JavaAstAnalyzer.analyzeClassBodyDeclaration(ctx);
                    if (methodInfo && JavaAstAnalyzer.isTestMethod(methodInfo.annotations)) {
                        testMethods.push({
                            methodName: methodInfo.methodName,
                            line: methodInfo.line,
                            column: methodInfo.column,
                            annotations: methodInfo.annotations
                        });
                    }
                },
                defaultResult: (): void => { /* no-op */ },
                aggregateResult: (): void => { /* no-op */ }
            });

            visitor.visit(ast);
            return testMethods;

        } catch (error) {
            console.warn('Failed to parse Java code with AST:', error);
            // Fallback to empty array rather than crashing
            return [];
        }
    }

    /**
     * Finds main methods in Java source code.
     * @param sourceCode Java source code as string  
     * @returns Array of MainMethod objects
     */
    public static findMainMethods(sourceCode: string): MainMethod[] {
        try {
            const ast = parse(sourceCode);
            const mainMethods: MainMethod[] = [];

            const visitor = createVisitor({
                visitClassBodyDeclaration: (ctx: any): void => {
                    const methodInfo = JavaAstAnalyzer.analyzeClassBodyDeclaration(ctx);
                    if (methodInfo && JavaAstAnalyzer.isMainMethod(methodInfo)) {
                        mainMethods.push({
                            methodName: methodInfo.methodName,
                            line: methodInfo.line,
                            column: methodInfo.column
                        });
                    }
                },
                defaultResult: (): void => { /* no-op */ },
                aggregateResult: (): void => { /* no-op */ }
            });

            visitor.visit(ast);
            return mainMethods;

        } catch (error) {
            console.warn('Failed to parse Java code with AST:', error);
            return [];
        }
    }

    /**
     * Analyzes a class body declaration to extract method information with annotations and modifiers.
     * @param classBodyCtx AST context for class body declaration
     * @returns Method information or null if not a method or invalid
     */
    private static analyzeClassBodyDeclaration(classBodyCtx: any): {
        methodName: string;
        line: number;
        column: number;
        annotations: string[];
        modifiers: string[];
        returnType?: string;
        parameters: string[];
    } | null {
        try {
            if (!classBodyCtx.children) {
                return null;
            }

            let methodCtx = null;
            const annotations: string[] = [];
            const modifiers: string[] = [];

            // Process children to extract annotations, modifiers, and find method
            for (const child of classBodyCtx.children) {
                if (child.constructor.name.includes('Modifier')) {
                    // Extract annotations and modifiers from ModifierContext
                    JavaAstAnalyzer.extractFromModifierContext(child, annotations, modifiers);
                } else if (child.constructor.name.includes('Member')) {
                    // Look for method declaration within member declaration
                    methodCtx = JavaAstAnalyzer.findMethodInMemberDeclaration(child);
                }
            }

            if (!methodCtx) {
                return null; // Not a method declaration
            }

            // Extract method name using ANTLR4 context patterns
            let methodName = 'unknown';
            if (methodCtx.identifier && typeof methodCtx.identifier === 'function') {
                const identifier = methodCtx.identifier();
                if (identifier && identifier.children && identifier.children[0] && identifier.children[0]._symbol) {
                    methodName = identifier.children[0]._symbol.text;
                }
            }

            // Extract position information
            const line = methodCtx._start?._line || 0;
            const column = methodCtx._start?._column || 0;

            // Extract parameters from method context
            const parameters = JavaAstAnalyzer.extractParametersFromMethod(methodCtx);

            return {
                methodName,
                line,
                column,
                annotations,
                modifiers,
                parameters
            };

        } catch (error) {
            console.warn('Failed to analyze class body declaration:', error);
            return null;
        }
    }

    /**
     * Determines if a method is a test method based on its annotations.
     */
    private static isTestMethod(annotations: string[]): boolean {
        return annotations.some(annotation => {
            // Handle both simple names and fully qualified names
            const simpleName = annotation.split('.').pop() || annotation;
            return JavaAstAnalyzer.TEST_ANNOTATIONS.has(simpleName) ||
                   JavaAstAnalyzer.TEST_ANNOTATIONS.has(annotation);
        });
    }

    /**
     * Determines if a method is a main method.
     */
    private static isMainMethod(methodInfo: {
        methodName: string;
        modifiers: string[];
        parameters: string[];
    }): boolean {
        return methodInfo.methodName === 'main' &&
               methodInfo.modifiers.includes('public') &&
               methodInfo.modifiers.includes('static') &&
               methodInfo.parameters.some(param => 
                   param.includes('String[]') || param.includes('String...')
               );
    }

    /**
     * Extracts annotations and modifiers from a ModifierContext.
     */
    private static extractFromModifierContext(modifierCtx: any, annotations: string[], modifiers: string[]): void {
        try {
            if (modifierCtx.children) {
                for (const child of modifierCtx.children) {
                    if (child.constructor.name.includes('ClassOrInterfaceModifier')) {
                        JavaAstAnalyzer.processClassOrInterfaceModifier(child, annotations, modifiers);
                    }
                }
            }
        } catch (error) {
            // Ignore extraction errors
        }
    }

    /**
     * Processes ClassOrInterfaceModifierContext to extract annotations or modifiers.
     */
    private static processClassOrInterfaceModifier(modifierCtx: any, annotations: string[], modifiers: string[]): void {
        if (modifierCtx.children) {
            for (const child of modifierCtx.children) {
                if (child.constructor.name.includes('Annotation')) {
                    // Extract annotation
                    JavaAstAnalyzer.extractAnnotationFromContext(child, annotations);
                } else if (child._symbol) {
                    // Extract modifier keyword
                    modifiers.push(child._symbol.text);
                }
            }
        }
    }

    /**
     * Extracts annotation name from AnnotationContext.
     */
    private static extractAnnotationFromContext(annotationCtx: any, annotations: string[]): void {
        try {
            if (annotationCtx.children) {
                for (const child of annotationCtx.children) {
                    if (child.constructor.name.includes('QualifiedName')) {
                        // Navigate to identifier within qualified name
                        JavaAstAnalyzer.extractIdentifierFromQualifiedName(child, annotations);
                    }
                }
            }
        } catch (error) {
            // Ignore extraction errors
        }
    }

    /**
     * Extracts identifier from QualifiedNameContext for annotation names.
     */
    private static extractIdentifierFromQualifiedName(qualifiedNameCtx: any, annotations: string[]): void {
        try {
            if (qualifiedNameCtx.children) {
                for (const child of qualifiedNameCtx.children) {
                    if (child.constructor.name.includes('Identifier')) {
                        JavaAstAnalyzer.extractIdentifierText(child, annotations);
                    }
                }
            }
        } catch (error) {
            // Ignore extraction errors
        }
    }

    /**
     * Extracts text from IdentifierContext.
     */
    private static extractIdentifierText(identifierCtx: any, annotations: string[]): void {
        try {
            if (identifierCtx.children) {
                for (const child of identifierCtx.children) {
                    if (child._symbol) {
                        annotations.push(child._symbol.text);
                    }
                }
            }
        } catch (error) {
            // Ignore extraction errors
        }
    }

    /**
     * Finds method declaration within MemberDeclarationContext.
     */
    private static findMethodInMemberDeclaration(memberCtx: any): any | null {
        try {
            if (memberCtx.children) {
                for (const child of memberCtx.children) {
                    if (child.constructor.name.includes('Method')) {
                        return child;
                    }
                }
            }
        } catch (error) {
            // Ignore errors
        }
        return null;
    }

    /**
     * Extracts parameter information from method context.
     */
    private static extractParametersFromMethod(methodCtx: any): string[] {
        const parameters: string[] = [];
        try {
            // Navigate to formal parameters
            if (methodCtx.children) {
                for (const child of methodCtx.children) {
                    if (child.constructor.name.includes('FormalParameters')) {
                        JavaAstAnalyzer.extractParametersFromFormalParameters(child, parameters);
                    }
                }
            }
        } catch (error) {
            // Ignore parameter extraction errors
        }
        return parameters;
    }

    /**
     * Extracts parameters from FormalParametersContext.
     */
    private static extractParametersFromFormalParameters(formalParamsCtx: any, parameters: string[]): void {
        try {
            if (formalParamsCtx.children) {
                for (const child of formalParamsCtx.children) {
                    if (child.constructor.name.includes('FormalParameterList')) {
                        JavaAstAnalyzer.extractParametersFromParameterList(child, parameters);
                    }
                }
            }
        } catch (error) {
            // Ignore extraction errors
        }
    }

    /**
     * Extracts parameters from FormalParameterListContext.
     */
    private static extractParametersFromParameterList(paramListCtx: any, parameters: string[]): void {
        try {
            if (paramListCtx.children) {
                for (const child of paramListCtx.children) {
                    if (child.constructor.name.includes('FormalParameter')) {
                        const paramType = JavaAstAnalyzer.extractParameterType(child);
                        if (paramType) {
                            parameters.push(paramType);
                        }
                    }
                }
            }
        } catch (error) {
            // Ignore extraction errors
        }
    }


    /**
     * Extracts parameter type from parameter node.
     */
    private static extractParameterType(paramNode: any): string | null {
        try {
            // Use getText() method to get the full parameter text
            if (paramNode.getText && typeof paramNode.getText === 'function') {
                return paramNode.getText();
            }
            
            // Navigate to TypeTypeContext child
            if (paramNode.children) {
                for (const child of paramNode.children) {
                    if (child.constructor.name.includes('TypeType')) {
                        // Try to get text from TypeType context
                        if (child.getText && typeof child.getText === 'function') {
                            return child.getText();
                        }
                        
                        // Navigate deeper into TypeType structure
                        return JavaAstAnalyzer.extractTypeFromTypeContext(child);
                    }
                }
            }
            
            // Legacy fallback
            return paramNode.type?.image ||
                   paramNode.unannType?.image ||
                   paramNode.Identifier?.[0]?.image ||
                   null;
        } catch {
            return null;
        }
    }

    /**
     * Extracts type information from TypeTypeContext.
     */
    private static extractTypeFromTypeContext(typeCtx: any): string | null {
        try {
            // Try getText first
            if (typeCtx.getText && typeof typeCtx.getText === 'function') {
                return typeCtx.getText();
            }

            // Navigate through children to build type string
            if (typeCtx.children) {
                let typeString = '';
                for (const child of typeCtx.children) {
                    if (child.constructor.name.includes('ClassOrInterfaceType')) {
                        const baseType = JavaAstAnalyzer.extractClassOrInterfaceType(child);
                        if (baseType) {
                            typeString += baseType;
                        }
                    } else if (child._symbol) {
                        // Array brackets, etc.
                        typeString += child._symbol.text;
                    }
                }
                return typeString || null;
            }

            return null;
        } catch {
            return null;
        }
    }

    /**
     * Extracts class or interface type name.
     */
    private static extractClassOrInterfaceType(typeCtx: any): string | null {
        try {
            if (typeCtx.getText && typeof typeCtx.getText === 'function') {
                return typeCtx.getText();
            }

            // Navigate to type identifier
            if (typeCtx.children) {
                for (const child of typeCtx.children) {
                    if (child.constructor.name.includes('TypeIdentifier')) {
                        if (child.children && child.children[0] && child.children[0]._symbol) {
                            return child.children[0]._symbol.text;
                        }
                    }
                }
            }

            return null;
        } catch {
            return null;
        }
    }
}