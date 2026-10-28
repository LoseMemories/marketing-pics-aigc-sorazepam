"""链路日志：每次阶段调用追加一行 JSONL，便于事后排查耗时/预算/失败原因。"""
import json, os, time, datetime

LOG_DIR = os.environ.get("DEEPSEEK_LOG_DIR") or os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs"
)


def log_stage(stage, **kw):
    """stage: subjects / ocr / sam / vocabulary / merge / write"""
    os.makedirs(LOG_DIR, exist_ok=True)
    rec = {"ts": datetime.datetime.now().isoformat(timespec="seconds"), "stage": stage}
    rec.update({k: v for k, v in kw.items() if v is not None})
    path = os.path.join(LOG_DIR, "workflow-%s.jsonl" % datetime.date.today().isoformat())
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


class Timer:
    def __init__(self):
        self.t0 = time.time()

    def ms(self):
        return int((time.time() - self.t0) * 1000)
