import { Logger } from 'tslog';

export const mosLogger = new Logger({
    name: 'MOS',
    prettyLogTemplate:
        '[{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}:{{ss}}]\t[{{logLevelName}}]\t[{{name}}]\t',
    prettyErrorTemplate:
        '\n{{errorName}} {{errorMessage}}\nerror stack:\n{{errorStack}}',
    prettyErrorStackTemplate:
        '  • {{fileName}}\t{{method}}\n\t{{filePathWithLine}}',
    prettyErrorParentNamesSeparator: ':',
    prettyErrorLoggerNameDelimiter: '\t',
    stylePrettyLogs: true,
    prettyLogTimeZone: 'UTC',
    prettyLogStyles: {
        logLevelName: {
            '*': ['bold', 'black', 'bgWhiteBright', 'dim'],
            SILLY: ['bold', 'white'],
            TRACE: ['bold', 'whiteBright'],
            DEBUG: ['bold', 'green'],
            INFO: ['bold', 'blue'],
            WARN: ['bold', 'yellow'],
            ERROR: ['bold', 'red'],
            FATAL: ['bold', 'redBright'],
        },
        dateIsoStr: 'white',
        filePathWithLine: 'white',
        name: ['white', 'bold'],
        nameWithDelimiterPrefix: ['white', 'bold'],
        nameWithDelimiterSuffix: ['white', 'bold'],
        errorName: ['bold', 'bgRedBright', 'whiteBright'],
        fileName: ['yellow'],
    },
    hideLogPositionForProduction: true,
    maskValuesOfKeys: [
        'apiKey',
        'signingKey',
        'signTxUrl',
        'script',
        'projectId',
    ],
});

export const configLogger = mosLogger.getSubLogger({ name: 'Config' });
export const scanLogger = mosLogger.getSubLogger({ name: 'Scan' });
export const feedLogger = mosLogger.getSubLogger({ name: 'Feed' });
export const txLogger = mosLogger.getSubLogger({ name: 'Tx' });
