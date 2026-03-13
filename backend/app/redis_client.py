import redis
import json
from typing import Any, Optional
from app.config import settings

class RedisClient:
    def __init__(self):
        self.client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=5
        )
    
    def set(self, key: str, value: Any, expire: int = 3600) -> bool:
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            return self.client.setex(key, expire, value)
        except Exception as e:
            print(f"Redis set error: {e}")
            return False
    
    def get(self, key: str) -> Optional[Any]:
        try:
            value = self.client.get(key)
            if value:
                try:
                    return json.loads(value)
                except:
                    return value
            return None
        except Exception as e:
            print(f"Redis get error: {e}")
            return None
    
    def delete(self, key: str) -> bool:
        try:
            return self.client.delete(key) > 0
        except Exception as e:
            print(f"Redis delete error: {e}")
            return False
    
    def cache_review(self, review_id: int, data: dict) -> bool:
        return self.set(f"review:{review_id}", data, expire=1800)
    
    def get_cached_review(self, review_id: int) -> Optional[dict]:
        return self.get(f"review:{review_id}")

redis_client = RedisClient()