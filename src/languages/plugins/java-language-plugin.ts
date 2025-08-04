////////////////////////////////////////////////////////////////////////////////////
// MIT License
//
// Copyright (c) 2021-2024 NVIDIA Corporation
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
////////////////////////////////////////////////////////////////////////////////////
import { BazelTarget } from '../../models/bazel-target';
import { BazelService } from '../../services/bazel-service';
import { EnvVarsUtils } from '../../services/env-vars-utils';
import { LanguagePlugin } from '../language-plugin';
import { JavaAstAnalyzer } from './java-ast-utils';
import * as path from 'path';
import * as vscode from 'vscode';


export class JavaLanguagePlugin implements LanguagePlugin {
    public readonly supportedLanguages: string[];

    constructor(private readonly context: vscode.ExtensionContext,
        private readonly bazelService: BazelService,
        private readonly setupEnvVars: string[]
    ) {
        this.supportedLanguages = ['java'];
    }

    public getDebugRunUnderCommand(port: number): string {
        return `--jvm_flags=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${port}`;
    }

    public getDebugEnvVars(_target: BazelTarget): string[] {
        return [];
    }

    public async createDebugRunUnderLaunchConfig(target: BazelTarget,
        _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
        const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
        const bazelArgs = target.getBazelArgs().toString();
        const configArgs = target.getConfigArgs().toString();
        const workingDirectory = '${workspaceFolder}';
        const runArgs = target.getRunArgs().toString();

        const envVars = target.getEnvVars().toStringArray().reduce((acc: { [key: string]: string }, envVar) => {
            const [key, value] = envVar.split('=', 2);
            acc[key] = value || '';
            return acc;
        }, {});

        const config = {
            name: `${bazelTarget} (Run Under)`,
            type: 'java',
            request: 'attach',
            hostName: 'localhost',
            port: 5005, // Default JDWP port
            timeout: 30000,
            preLaunchTask: {
                type: 'shell',
                command: 'bazel',
                args: [target.action, '--run_under=gdbserver :5005', ...bazelArgs.split(' '), ...configArgs.split(' '), bazelTarget, ...runArgs.split(' ')],
                options: {
                    cwd: workingDirectory,
                    env: { ...process.env, ...EnvVarsUtils.listToObject(this.setupEnvVars), ...envVars }
                }
            }
        } as vscode.DebugConfiguration;
        return config;
    }

    public async createDebugDirectLaunchConfig(target: BazelTarget, _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
        const workingDirectory = '${workspaceFolder}';
        const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
        const runArgs = target.getRunArgs().toString();

        const envVars = target.getEnvVars().toStringArray().reduce((acc: { [key: string]: string }, envVar) => {
            const [key, value] = envVar.split('=', 2);
            acc[key] = value || '';
            return acc;
        }, {});

        return {
            name: `${bazelTarget} (Direct)`,
            type: 'java',
            request: 'launch',
            mainClass: '${file}', // VSCode will resolve this
            classPaths: ['${workspaceFolder}'],
            cwd: workingDirectory,
            env: { ...EnvVarsUtils.listToObject(this.setupEnvVars), ...envVars },
            args: runArgs.length > 0 ? runArgs.split(' ') : [],
            console: 'internalConsole'
        };
    }

    public async createDebugAttachConfig(target: BazelTarget,
        port: number,
        _cancellationToken?: vscode.CancellationToken): Promise<vscode.DebugConfiguration> {
        const bazelTarget = BazelService.formatBazelTargetFromPath(target.buildPath);
        const workingDirectory = '${workspaceFolder}';

        const envVars = target.getEnvVars().toStringArray().reduce((acc: { [key: string]: string }, envVar) => {
            const [key, value] = envVar.split('=', 2);
            acc[key] = value || '';
            return acc;
        }, {});

        const config = {
            name: `${bazelTarget} (Attach)`,
            type: 'java',
            request: 'attach',
            hostName: 'localhost',
            port: port,
            timeout: 30000,
            projectName: '${workspaceFolderBasename}',
            env: { ...EnvVarsUtils.listToObject(this.setupEnvVars), ...envVars }
        };
        return config;
    }

    /**
     * Legacy regex method for JUnit test methods in Java.
     * NOTE: This method is now deprecated. Java test detection uses AST-based
     * parsing in UnifiedCodeLensProvider.processJavaAst() for better accuracy.
     * 
     * @deprecated Use JavaAstAnalyzer.findTestMethods() instead
     */
    public getCodeLensTestRegex(): RegExp {
        // Return a placeholder regex - actual detection is done via AST
        return /@Test\b[\s\S]*?void\s+(\w+)\s*\(/gm;
    }

    /**
     * Legacy regex method for Java main method definitions.
     * NOTE: This method is now deprecated. Java main method detection uses AST-based
     * parsing in UnifiedCodeLensProvider.processJavaAst() for better accuracy.
     * 
     * @deprecated Use JavaAstAnalyzer.findMainMethods() instead
     */
    public getCodeLensRunRegex(): RegExp {
        // Return a placeholder regex - actual detection is done via AST
        return /(?:public\s+static|static\s+public)\s+void\s+(main)\s*\(\s*String\s*\[\s*\]\s+\w+\s*\)/gm;
    }

}