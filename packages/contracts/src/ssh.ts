import { z } from "zod";

export const SshProfileIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/);
export const SshHostKeySchema = z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/);
export const SshConnectionProfileSchema = z
  .object({
    id: SshProfileIdSchema,
    label: z.string().min(1).max(100),
    hostname: z
      .string()
      .min(1)
      .max(253)
      .regex(/^[a-zA-Z0-9:][a-zA-Z0-9_.:-]*$/),
    port: z.number().int().min(1).max(65535),
    username: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.@\\-]*$/),
    hostKeySha256: SshHostKeySchema.nullable(),
    revision: z.number().int().min(1)
  })
  .strict();
export type SshConnectionProfile = z.infer<typeof SshConnectionProfileSchema>;

/** Public immutable destination identity; no authentication material. */
export const SshConnectionIdentitySchema = SshConnectionProfileSchema.omit({
  label: true
})
  .extend({
    hostKeySha256: SshHostKeySchema
  })
  .strict();
export type SshConnectionIdentity = z.infer<typeof SshConnectionIdentitySchema>;

export interface SshProfileSummary extends SshConnectionProfile {
  hasCredential: boolean;
  credentialStorage: "encrypted" | "session" | "missing";
}
export interface SshSettingsSummary {
  profiles: SshProfileSummary[];
  encryptionAvailable: boolean;
}
export const SshProfileSaveInputSchema = SshConnectionProfileSchema.omit({
  id: true,
  revision: true,
  hostKeySha256: true
})
  .extend({
    id: SshProfileIdSchema.optional(),
    password: z.string().max(1024).optional(),
    rememberPassword: z.boolean()
  })
  .strict();
export type SshProfileSaveInput = z.infer<typeof SshProfileSaveInputSchema>;

/** Private Main-to-Core control only; never an Agent/Renderer RPC method. */
export const SshPrivateConfigurationSchema = z
  .object({
    profiles: z
      .array(
        z
          .object({
            profile: SshConnectionProfileSchema,
            password: z.string().min(1).max(1024).optional()
          })
          .strict()
      )
      .max(100)
  })
  .strict();
export type SshPrivateConfiguration = z.infer<
  typeof SshPrivateConfigurationSchema
>;

export const SSH_ERROR_MESSAGES = {
  SSH_INVALID_INPUT: "SSH 设置无效",
  SSH_PROFILE_MISSING: "SSH 连接配置不存在",
  SSH_CREDENTIAL_MISSING: "请在设置中提供 SSH 密码",
  SSH_HOST_KEY_UNCONFIRMED: "请先核对并确认 SSH 主机指纹",
  SSH_HOST_KEY_CHANGED: "SSH 主机指纹不匹配，已拒绝连接",
  SSH_IDENTITY_CHANGED: "SSH 连接身份已改变，请重新冻结并批准计划",
  SSH_AUTH_FAILED: "SSH 密码认证失败或服务器要求其他认证方式",
  SSH_CONNECT_FAILED: "SSH 连接失败，请检查主机与端口",
  SSH_TIMEOUT: "SSH 响应超时，原 Job 状态未知；请核对后重连",
  SSH_OUTPUT_LIMIT: "SSH 回收内容超过限额",
  SSH_PROTOCOL_FAILED: "SSH 任务响应无效或远端环境检查失败",
  SSH_ENCRYPTION_UNAVAILABLE: "系统加密不可用，请使用仅本次会话保存",
  SSH_ACCESS_DENIED: "SSH 设置请求未授权"
} as const;
export type SshErrorCode = keyof typeof SSH_ERROR_MESSAGES;
