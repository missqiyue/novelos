import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

app = FastAPI(title="RAG Microservice", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChapterChunk(BaseModel):
    chapter: int
    scene_index: int
    content: str
    chunk_type: str = "scene"
    parent_chunk_id: Optional[str] = None
    source_file: Optional[str] = None

class IndexChapterRequest(BaseModel):
    project_root: str
    chapter: int
    scenes: List[Dict[str, Any]]
    summary: Optional[str] = None

class RetrieveContextRequest(BaseModel):
    project_root: str
    query: str
    top_k: int = 5
    mode: str = "auto"
    chunk_type: Optional[str] = None
    chapter: Optional[int] = None
    center_entities: Optional[List[str]] = None

@app.post("/api/v1/index/chapter")
async def index_chapter(req: IndexChapterRequest):
    from data_modules.rag_adapter import RAGAdapter
    from data_modules.config import DataModulesConfig
    
    config = DataModulesConfig.from_project_root(req.project_root)
    adapter = RAGAdapter(config)
    
    chunks = []
    parent_chunk_id = None
    if req.summary:
        parent_chunk_id = f"ch{req.chapter:04d}_summary"
        chunks.append({
            "chapter": req.chapter,
            "scene_index": 0,
            "content": req.summary,
            "chunk_type": "summary",
            "chunk_id": parent_chunk_id,
            "source_file": f"summaries/ch{req.chapter:04d}.md",
        })
        
    for s in req.scenes:
        scene_index = s.get("index", 0)
        chunk_id = f"ch{req.chapter:04d}_s{int(scene_index)}"
        chunks.append({
            "chapter": req.chapter,
            "scene_index": scene_index,
            "content": s.get("content", ""),
            "chunk_type": "scene",
            "parent_chunk_id": parent_chunk_id,
            "chunk_id": chunk_id,
            "source_file": f"正文/第{req.chapter:04d}章.md#scene_{int(scene_index)}",
        })
        
    stored = await adapter.store_chunks(chunks)
    skipped = len(chunks) - stored
    return {
        "status": "success",
        "data": {
            "stored": stored,
            "skipped": skipped,
            "total": len(chunks)
        }
    }

@app.post("/api/v1/retrieve/context")
async def retrieve_context(req: RetrieveContextRequest):
    from data_modules.rag_adapter import RAGAdapter
    from data_modules.config import DataModulesConfig
    
    config = DataModulesConfig.from_project_root(req.project_root)
    adapter = RAGAdapter(config)
    
    results = await adapter.search(
        query=req.query,
        top_k=req.top_k,
        strategy=req.mode,
        chunk_type=req.chunk_type,
        chapter=req.chapter,
        center_entities=req.center_entities,
    )
    
    payload = [r.__dict__ for r in results]
    degraded_reason = adapter.degraded_mode_reason
    
    response = {
        "status": "success",
        "data": payload
    }
    
    if degraded_reason:
        response["warnings"] = [{"code": "DEGRADED_MODE", "reason": degraded_reason}]
        
    return response

@app.get("/api/v1/system/sync-status")
async def system_sync_status(project_root: Optional[str] = None):
    """
    返回系统状态，供前端或 Node.js 心跳检测使用
    """
    from data_modules.rag_adapter import RAGAdapter
    from data_modules.config import DataModulesConfig
    
    try:
        config = DataModulesConfig.from_project_root(project_root) if project_root else DataModulesConfig()
        adapter = RAGAdapter(config)
        stats = adapter.get_stats()
        
        return {
            "status": "success",
            "data": {
                "sync_status": "ok",
                "vectors_count": stats.get("vectors", 0),
                "terms_count": stats.get("terms", 0),
                "max_chapter": stats.get("max_chapter", 0)
            }
        }
    except Exception as e:
        return {
            "status": "success",
            "data": {
                "sync_status": "error",
                "message": str(e),
                "vectors_count": 0,
                "terms_count": 0,
                "max_chapter": 0
            }
        }

@app.get("/api/v1/alerts/logs")
async def alerts_logs(limit: int = 50, project_root: Optional[str] = None):
    """
    返回系统的警告日志，供监控面板使用。
    """
    from data_modules.config import DataModulesConfig
    import os
    import json
    
    try:
        config = DataModulesConfig.from_project_root(project_root) if project_root else DataModulesConfig()
        log_file = config.webnovel_dir / "logs" / "perf_timings.jsonl"
        logs = []
        if log_file.exists():
            with open(log_file, "r", encoding="utf-8") as f:
                lines = f.readlines()
                for line in reversed(lines):
                    if len(logs) >= limit:
                        break
                    if line.strip():
                        try:
                            logs.append(json.loads(line))
                        except:
                            pass
        return {
            "status": "success",
            "data": logs
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "data": []
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8088)
