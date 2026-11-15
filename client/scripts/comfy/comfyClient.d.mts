export const COMFY_URL: string;

export function zImageWorkflow(options: {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  batch?: number;
  prefix?: string;
  /** 已上傳的底圖檔名；有值時為 img2img */
  image?: string;
  denoise?: number;
}): Record<string, unknown>;

export function uploadImage(buffer: Buffer, name: string): Promise<string>;
export function runWorkflow(workflow: Record<string, unknown>): Promise<Buffer[]>;
