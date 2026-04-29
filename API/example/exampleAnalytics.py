"""Example client for layered analytics endpoints."""

import json
import requests

BASE_URL = "http://localhost:8200"


def main():
    dataset_resp = requests.post(
        f"{BASE_URL}/v1/analytics/datasets/register",
        json={
            "name": "employee_data",
            "source_type": "local_path",
            "path": "./example/employee_data.csv",
            "format": "csv",
            "description": "Employee dataset for architecture smoke test",
        },
        timeout=60,
    )
    dataset_resp.raise_for_status()
    dataset = dataset_resp.json()
    dataset_id = dataset["id"]

    print("[dataset]")
    print(json.dumps(dataset, ensure_ascii=False, indent=2))

    job_resp = requests.post(
        f"{BASE_URL}/v1/analytics/jobs/run",
        json={
            "dataset_id": dataset_id,
            "depth": "deep",
            "group_by": ["department"],
            "time_column": "hire_date",
            "target_column": "salary",
            "top_n_categories": 8,
        },
        timeout=180,
    )
    job_resp.raise_for_status()
    job = job_resp.json()

    print("\n[job]")
    print(json.dumps({
        "id": job.get("id"),
        "status": job.get("status"),
        "duration_seconds": job.get("duration_seconds"),
        "error": job.get("error"),
    }, ensure_ascii=False, indent=2))

    report = job.get("result", {}).get("report_markdown", "")
    print("\n[report]")
    print(report)


if __name__ == "__main__":
    main()
