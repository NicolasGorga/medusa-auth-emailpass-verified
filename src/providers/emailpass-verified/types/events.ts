export enum EmailPassVerifiedEvents {
    CODE_GENERATED = 'emailpass_auth.code_generated',
}

export type CodeGeneratedEventData = {
    email: string
    code: string
    callbackUrl: string
}