/**
 * ComfyUI API client（`38-map-control.md` § 38.9「素材來源」）。
 *
 * 只走 HTTP API：POST /upload/image 上傳底圖、POST /prompt 送 workflow → 輪詢 /history/{id} → GET /view 下載。
 * 位址由環境變數 `COMFY_URL` 覆寫，預設 `http://192.168.1.106:8188`。
 */
import { randomUUID } from 'node:crypto';

export const COMFY_URL = process.env.COMFY_URL ?? 'http://192.168.1.106:8188';

const POLL_MS = 1000;
const TIMEOUT_MS = 10 * 60 * 1000;

/** z_image_turbo 文生圖 workflow（API 格式）；給 image（已上傳的檔名）時為 img2img，以該圖為起始 latent、強度 denoise */
export function zImageWorkflow({ prompt, width, height, seed, batch = 1, prefix = 'mayana', image, denoise = 1 }) {
  const workflow = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    model: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['unet', 0], shift: 3 } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: prompt } },
    neg: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } },
    latent: { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: batch } },
    sample: {
      class_type: 'KSampler',
      inputs: {
        model: ['model', 0], positive: ['pos', 0], negative: ['neg', 0], latent_image: ['latent', 0],
        seed, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise,
      },
    },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: prefix } },
  };
  if (image) {
    delete workflow.latent;
    workflow.load = { class_type: 'LoadImage', inputs: { image } };
    workflow.encode = { class_type: 'VAEEncode', inputs: { pixels: ['load', 0], vae: ['vae', 0] } };
    workflow.sample.inputs.latent_image = ['encode', 0];
  }
  return workflow;
}

async function request(path, init) {
  const res = await fetch(`${COMFY_URL}${path}`, init);
  if (!res.ok) throw new Error(`ComfyUI ${path} → ${res.status} ${await res.text()}`);
  return res;
}

/** 上傳 PNG 到 ComfyUI 的 input 資料夾（同名覆寫），回傳 LoadImage 用的檔名 */
export async function uploadImage(buffer, name) {
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: 'image/png' }), name);
  form.append('overwrite', 'true');
  const res = await request('/upload/image', { method: 'POST', body: form });
  return (await res.json()).name;
}

/** 送出 workflow，等完成後回傳所有輸出圖的 PNG Buffer */
export async function runWorkflow(workflow) {
  const res = await request('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: randomUUID() }),
  });
  const { prompt_id: promptId, node_errors: nodeErrors } = await res.json();
  if (nodeErrors && Object.keys(nodeErrors).length > 0) {
    throw new Error(`ComfyUI node errors: ${JSON.stringify(nodeErrors)}`);
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const history = await (await request(`/history/${promptId}`)).json();
    const entry = history[promptId];
    if (entry?.status?.status_str === 'error') {
      throw new Error(`ComfyUI 執行失敗：${JSON.stringify(entry.status.messages)}`);
    }
    if (entry?.status?.completed) {
      const images = Object.values(entry.outputs).flatMap(out => out.images ?? []);
      return await Promise.all(images.map(async img => {
        const query = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
        return Buffer.from(await (await request(`/view?${query}`)).arrayBuffer());
      }));
    }
    await new Promise(resolve => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`ComfyUI 逾時：${promptId}`);
}
