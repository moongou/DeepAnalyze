"""
Model gateway for multi-provider LLM routing.
Supports local vLLM and any OpenAI-compatible model endpoint.
"""

import json
import os
import threading
from typing import Any, Dict, List, Optional, Tuple

import openai

from config import API_BASE, DEFAULT_MODEL, WORKSPACE_BASE_DIR

MODEL_REGISTRY_PATH = os.path.join(WORKSPACE_BASE_DIR, "_model_registry.json")


class ModelGateway:
    """Unified gateway for model provider management and routing."""

    def __init__(self):
        self._lock = threading.Lock()
        self._sync_clients: Dict[str, openai.OpenAI] = {}
        self._async_clients: Dict[str, openai.AsyncOpenAI] = {}
        self._registry = self._load_or_init_registry()

    def _default_registry(self) -> Dict[str, Any]:
        return {
            "providers": [
                {
                    "id": "local-vllm",
                    "name": "Local vLLM",
                    "type": "openai_compatible",
                    "base_url": API_BASE,
                    "api_key": "dummy",
                    "api_key_env": "",
                    "enabled": True,
                    "is_default": True,
                    "extra_headers": {},
                }
            ],
            "models": [
                {
                    "id": DEFAULT_MODEL,
                    "provider_id": "local-vllm",
                    "provider_model": DEFAULT_MODEL,
                    "description": "Default local model",
                    "enabled": True,
                }
            ],
        }

    def _load_or_init_registry(self) -> Dict[str, Any]:
        os.makedirs(WORKSPACE_BASE_DIR, exist_ok=True)
        if not os.path.exists(MODEL_REGISTRY_PATH):
            registry = self._default_registry()
            self._save_registry(registry)
            return registry

        try:
            with open(MODEL_REGISTRY_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if not isinstance(loaded, dict):
                raise ValueError("Registry file is not a JSON object")
            loaded.setdefault("providers", [])
            loaded.setdefault("models", [])
            if not loaded["providers"]:
                loaded = self._default_registry()
                self._save_registry(loaded)
            return loaded
        except Exception:
            fallback = self._default_registry()
            self._save_registry(fallback)
            return fallback

    def _save_registry(self, registry: Optional[Dict[str, Any]] = None) -> None:
        payload = registry if registry is not None else self._registry
        os.makedirs(os.path.dirname(MODEL_REGISTRY_PATH), exist_ok=True)
        tmp_path = f"{MODEL_REGISTRY_PATH}.{os.getpid()}.{threading.get_ident()}.tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, MODEL_REGISTRY_PATH)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def _find_provider(self, provider_id: str) -> Optional[Dict[str, Any]]:
        for provider in self._registry.get("providers", []):
            if provider.get("id") == provider_id:
                return provider
        return None

    def _find_model(self, model_id: str) -> Optional[Dict[str, Any]]:
        for model in self._registry.get("models", []):
            if model.get("id") == model_id:
                return model
        return None

    def _resolve_provider_key(self, provider: Dict[str, Any]) -> str:
        env_name = provider.get("api_key_env") or ""
        if env_name and os.getenv(env_name):
            return str(os.getenv(env_name))
        if provider.get("api_key"):
            return str(provider.get("api_key"))
        return "dummy"

    def _provider_headers(self, provider: Dict[str, Any]) -> Optional[Dict[str, str]]:
        headers = provider.get("extra_headers")
        if isinstance(headers, dict) and headers:
            return {str(k): str(v) for k, v in headers.items()}
        return None

    def _clear_provider_clients(self, provider_id: str) -> None:
        self._sync_clients.pop(provider_id, None)
        self._async_clients.pop(provider_id, None)

    def list_providers(self, include_disabled: bool = True) -> List[Dict[str, Any]]:
        with self._lock:
            providers = self._registry.get("providers", [])
            if include_disabled:
                return [dict(p) for p in providers]
            return [dict(p) for p in providers if p.get("enabled", True)]

    def upsert_provider(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        provider_id = str(payload.get("id", "")).strip()
        if not provider_id:
            raise ValueError("Provider id is required")

        provider_type = str(payload.get("type") or "openai_compatible").strip()
        if provider_type != "openai_compatible":
            raise ValueError("Only openai_compatible providers are supported currently")

        base_url = str(payload.get("base_url", "")).strip()
        if not base_url:
            raise ValueError("Provider base_url is required")

        with self._lock:
            existing = self._find_provider(provider_id)
            if existing is None:
                existing = {
                    "id": provider_id,
                    "name": payload.get("name") or provider_id,
                    "type": provider_type,
                    "base_url": base_url,
                    "api_key": payload.get("api_key", ""),
                    "api_key_env": payload.get("api_key_env", ""),
                    "enabled": bool(payload.get("enabled", True)),
                    "is_default": bool(payload.get("is_default", False)),
                    "extra_headers": payload.get("extra_headers") or {},
                }
                self._registry["providers"].append(existing)
            else:
                existing.update(
                    {
                        "name": payload.get("name", existing.get("name", provider_id)),
                        "type": provider_type,
                        "base_url": base_url,
                        "api_key": payload.get("api_key", existing.get("api_key", "")),
                        "api_key_env": payload.get("api_key_env", existing.get("api_key_env", "")),
                        "enabled": bool(payload.get("enabled", existing.get("enabled", True))),
                        "is_default": bool(payload.get("is_default", existing.get("is_default", False))),
                        "extra_headers": payload.get("extra_headers", existing.get("extra_headers", {})) or {},
                    }
                )

            if existing.get("is_default"):
                for provider in self._registry["providers"]:
                    if provider.get("id") != provider_id:
                        provider["is_default"] = False

            self._save_registry()
            self._clear_provider_clients(provider_id)
            return dict(existing)

    def remove_provider(self, provider_id: str) -> bool:
        with self._lock:
            before = len(self._registry.get("providers", []))
            self._registry["providers"] = [
                p for p in self._registry.get("providers", []) if p.get("id") != provider_id
            ]
            removed = len(self._registry["providers"]) < before
            if removed:
                self._registry["models"] = [
                    m for m in self._registry.get("models", []) if m.get("provider_id") != provider_id
                ]
                if not any(p.get("is_default") for p in self._registry["providers"]):
                    if self._registry["providers"]:
                        self._registry["providers"][0]["is_default"] = True
                if not self._registry["providers"]:
                    self._registry = self._default_registry()
                self._save_registry()
                self._clear_provider_clients(provider_id)
            return removed

    def list_models(self, include_disabled: bool = True) -> List[Dict[str, Any]]:
        with self._lock:
            models = self._registry.get("models", [])
            if include_disabled:
                return [dict(m) for m in models]
            return [dict(m) for m in models if m.get("enabled", True)]

    def upsert_model(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        model_id = str(payload.get("id", "")).strip()
        if not model_id:
            raise ValueError("Model id is required")

        provider_id = str(payload.get("provider_id", "")).strip()
        if not provider_id:
            raise ValueError("provider_id is required")

        provider = self._find_provider(provider_id)
        if not provider:
            raise ValueError(f"Provider not found: {provider_id}")

        provider_model = str(payload.get("provider_model") or model_id).strip()

        with self._lock:
            existing = self._find_model(model_id)
            if existing is None:
                existing = {
                    "id": model_id,
                    "provider_id": provider_id,
                    "provider_model": provider_model,
                    "description": payload.get("description", ""),
                    "enabled": bool(payload.get("enabled", True)),
                }
                self._registry["models"].append(existing)
            else:
                existing.update(
                    {
                        "provider_id": provider_id,
                        "provider_model": provider_model,
                        "description": payload.get("description", existing.get("description", "")),
                        "enabled": bool(payload.get("enabled", existing.get("enabled", True))),
                    }
                )

            self._save_registry()
            return dict(existing)

    def remove_model(self, model_id: str) -> bool:
        with self._lock:
            before = len(self._registry.get("models", []))
            self._registry["models"] = [
                m for m in self._registry.get("models", []) if m.get("id") != model_id
            ]
            removed = len(self._registry["models"]) < before
            if removed:
                self._save_registry()
            return removed

    def _default_provider(self) -> Dict[str, Any]:
        enabled = [p for p in self._registry.get("providers", []) if p.get("enabled", True)]
        if not enabled:
            raise ValueError("No enabled model providers")
        for provider in enabled:
            if provider.get("is_default"):
                return provider
        return enabled[0]

    def resolve_model(self, model_id: str) -> Tuple[Dict[str, Any], str, str]:
        with self._lock:
            model_entry = self._find_model(model_id)
            if model_entry and model_entry.get("enabled", True):
                provider_id = str(model_entry.get("provider_id"))
                provider = self._find_provider(provider_id)
                if provider and provider.get("enabled", True):
                    return provider, provider_id, str(model_entry.get("provider_model") or model_id)

            if ":" in model_id:
                provider_id, provider_model = model_id.split(":", 1)
                provider = self._find_provider(provider_id)
                if provider and provider.get("enabled", True):
                    return provider, provider_id, provider_model

            provider = self._default_provider()
            return provider, str(provider.get("id")), model_id

    def get_sync_client(self, provider_id: str) -> openai.OpenAI:
        with self._lock:
            if provider_id in self._sync_clients:
                return self._sync_clients[provider_id]

            provider = self._find_provider(provider_id)
            if not provider:
                raise ValueError(f"Provider not found: {provider_id}")
            if provider.get("type") != "openai_compatible":
                raise ValueError(f"Provider type not supported: {provider.get('type')}")

            client = openai.OpenAI(
                base_url=provider["base_url"],
                api_key=self._resolve_provider_key(provider),
                default_headers=self._provider_headers(provider),
            )
            self._sync_clients[provider_id] = client
            return client

    def get_async_client(self, provider_id: str) -> openai.AsyncOpenAI:
        with self._lock:
            if provider_id in self._async_clients:
                return self._async_clients[provider_id]

            provider = self._find_provider(provider_id)
            if not provider:
                raise ValueError(f"Provider not found: {provider_id}")
            if provider.get("type") != "openai_compatible":
                raise ValueError(f"Provider type not supported: {provider.get('type')}")

            client = openai.AsyncOpenAI(
                base_url=provider["base_url"],
                api_key=self._resolve_provider_key(provider),
                default_headers=self._provider_headers(provider),
            )
            self._async_clients[provider_id] = client
            return client


model_gateway = ModelGateway()
