import {
  AbstractAuthModuleProvider,
  AbstractEventBusModuleService,
  isDate,
  isString,
  MedusaError,
  MedusaErrorTypes,
} from "@medusajs/framework/utils";
import {
  AuthenticationInput,
  AuthIdentityProviderService,
  AuthenticationResponse,
  IEventBusModuleService,
  AuthIdentityDTO,
  EmailPassAuthProviderOptions,
} from "@medusajs/types";
import crypto from "crypto";
import Scrypt from "scrypt-kdf";
import { EmailPassVerifiedEvents } from "../types/events";

type InjectedDependencies = {
  event_bus: IEventBusModuleService;
};

interface EmailPassVerifiedAuthProviderOptions
  extends EmailPassAuthProviderOptions {
  callbackUrl?: string;
}

interface EmailPassVerifiedServiceConfig
  extends Required<Omit<EmailPassVerifiedAuthProviderOptions, "callbackUrl">>,
    Pick<EmailPassVerifiedAuthProviderOptions, "callbackUrl"> {}

class EmailPassVerified extends AbstractAuthModuleProvider {
  static identifier = "emailpass-verified";
  static DISPLAY_NAME = "Email Password Verified";

  protected readonly eventBus_: IEventBusModuleService;
  protected readonly config_: EmailPassVerifiedServiceConfig;

  constructor(
    container: InjectedDependencies,
    options: EmailPassVerifiedAuthProviderOptions
  ) {
    super();
    this.eventBus_ = container.event_bus;
    this.config_ = {
      hashConfig: options.hashConfig ?? { logN: 15, r: 8, p: 1 },
      callbackUrl: options.callbackUrl,
    };
  }

  private async generateVerificationCode(): Promise<{
    code: string;
    codeHash: string;
  }> {
    const code = crypto.randomBytes(32).toString("hex");
    const codeHash = await this.hashValue(code);

    return { code, codeHash: codeHash };
  }

  protected async hashValue(value: string) {
    const valueHash = await Scrypt.kdf(value, this.config_.hashConfig);
    return valueHash.toString("base64");
  }

  register(
    data: AuthenticationInput,
    authIdentityProviderService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    throw new MedusaError(
      MedusaErrorTypes.INVALID_DATA,
      `${EmailPassVerified.DISPLAY_NAME} does not support registration. Use method 'authenticate' instead`
    );
  }

  async authenticate(
    data: AuthenticationInput,
    authIdentityProviderService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const { email, password } = data.body ?? {};

    if (!password || !isString(password)) {
      return {
        success: false,
        error: "Password should be a string",
      };
    }

    if (!email || !isString(email)) {
      return {
        success: false,
        error: "Email should be a string",
      };
    }

    let authIdentity: AuthIdentityDTO | undefined;

    try {
      authIdentity = await authIdentityProviderService.retrieve({
        entity_id: email,
      });
    } catch (error) {
      if (error.type !== MedusaError.Types.NOT_FOUND) {
        return { success: false, error: error.message };
      }

      const { code, codeHash } = await this.generateVerificationCode();
      const passwordHash = await this.hashValue(password);

      authIdentityProviderService.setState(code, {
        password: passwordHash,
        code: codeHash,
      });

      const callbackUrl = data.body?.callback_url || this.config_.callbackUrl;
      if (!isString(callbackUrl)) {
        return {
          success: false,
          error:
            "`callback_url` not set in request body, nor in provider options.",
        };
      }

      await this.eventBus_.emit({
        name: EmailPassVerifiedEvents.CODE_GENERATED,
        data: {
          code,
          email,
          callbackUrl,
        },
      });

      return {
        success: true,
        location: "pending_verification",
      };
    }

    const providerIdentity = authIdentity.provider_identities?.find(
      (pi) => pi.provider === this.identifier
    )!;

    const passwordHash = providerIdentity.provider_metadata?.password;

    if (isString(passwordHash)) {
      const buf = Buffer.from(passwordHash as string, "base64");
      const success = await Scrypt.verify(buf, password);

      if (!success) {
        return {
          success: false,
          error: "Invalid email or password",
        };
      }

      const copy = JSON.parse(JSON.stringify(authIdentity));
      const providerIdentity = copy.provider_identities?.find(
        (pi) => pi.provider === this.provider
      )!;
      delete providerIdentity.provider_metadata?.password;

      authIdentity = copy;
    } else {
      return {
        success: false,
        error: "Invalid email or password",
      };
    }

    return {
      success: true,
      authIdentity,
    };
  }

  async validateCallback(
    data: AuthenticationInput,
    authIdentityProviderService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const code = data.query?.code;
    const email = data.query?.email;

    if (!isString(code)) {
      return {
        success: false,
        error: "`code` must be a string",
      };
    }

    if (!isString(email)) {
      return {
        success: false,
        error: "`email` must be a string",
      };
    }

    const { code: hashCode, password } =
      ((await authIdentityProviderService.getState(code)) as Record<
        string,
        unknown
      >) ?? {};
    if (!isString(hashCode) || !isString(password)) {
      return {
        success: false,
        error: `No code and/or password set in cache for email: ${email}, call the authenticate route again`,
      };
    }

    const buf = Buffer.from(hashCode, "base64");
    const success = await Scrypt.verify(buf, code);

    if (!success) {
      return {
        success: false,
        error: "Invalid code",
      };
    }

    let authIdentity: AuthIdentityDTO;
    try {
      authIdentity = await authIdentityProviderService.retrieve({
        entity_id: email,
      });
    } catch (error) {
      if (error.type === MedusaError.Types.NOT_FOUND) {
        const createdAuthIdentity = await authIdentityProviderService.create({
          entity_id: email,
          provider_metadata: {
            password,
          },
          user_metadata: {
            email,
          },
        });
        authIdentity = createdAuthIdentity;
      } else {
        return { success: false, error: error.message };
      }
    }

    return {
      success: true,
      authIdentity,
    };
  }

  async update(
    data: { password: string; entity_id: string },
    authIdentityService: AuthIdentityProviderService
  ) {
    const { password, entity_id } = data ?? {};

    if (!entity_id) {
      return {
        success: false,
        error: `Cannot update ${this.provider} provider identity without entity_id`,
      };
    }

    if (!password || !isString(password)) {
      return { success: true };
    }

    let authIdentity: AuthIdentityDTO;

    try {
      const passwordHash = await this.hashValue(password);

      authIdentity = await authIdentityService.update(entity_id, {
        provider_metadata: {
          password: passwordHash,
        },
      });
    } catch (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      authIdentity,
    };
  }
}

export default EmailPassVerified;
