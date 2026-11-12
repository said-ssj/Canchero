// Google Identity Services: Google muestra el dominio de la web y no el de Supabase.
const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    nonce: string;
    ux_mode: 'popup';
    use_fedcm_for_button?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
}

let loading: Promise<GoogleId> | undefined;

export function loadGoogleIdentity(): Promise<GoogleId> {
  const current = (window as any).google?.accounts?.id as GoogleId | undefined;
  if (current) return Promise.resolve(current);
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => {
      const id = (window as any).google?.accounts?.id as GoogleId | undefined;
      if (id) resolve(id);
      else reject(new Error('Google Identity Services no se inicializó'));
    };
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error('No se pudo cargar Google Identity Services'));
    };
    document.head.append(script);
  });
  return loading;
}

/** Nonce aleatorio: Google recibe su SHA-256 y Supabase el original, así el token no se reutiliza. */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return { raw, hashed };
}
