const API = import.meta.env.VITE_API_URL || "http://localhost:3000";
const TOKEN_KEY = "balbina_agro_token";

export async function login(username: string, password: string): Promise<void> {
	const response = await fetch(`${API}/api/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ username, password }),
	});

	const result = await response.json();
	if (!response.ok || typeof result.token !== "string") {
		throw new Error(result.error || "Não foi possível entrar.");
	}

	localStorage.setItem(TOKEN_KEY, result.token);
}

export function hasToken(): boolean {
	return Boolean(localStorage.getItem(TOKEN_KEY));
}

export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch(
	endpoint: string,
	options: RequestInit = {}
): Promise<Response> {
	const headers = new Headers(options.headers);
	const token = localStorage.getItem(TOKEN_KEY);

	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	const response = await fetch(`${API}${endpoint}`, {
		...options,
		headers,
	});

	if (response.status === 401) {
		clearToken();
		window.dispatchEvent(new Event("balbina-auth-expired"));
	}

	return response;
}
