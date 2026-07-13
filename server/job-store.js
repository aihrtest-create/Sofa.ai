import fs from "node:fs";
import path from "node:path";

export class JobStore {
  constructor(root) {
    this.directory = path.join(root, ".runtime");
    this.file = path.join(this.directory, "reupholster-jobs.json");
    this.jobs = new Map();
  }

  async load() {
    await fs.promises.mkdir(this.directory, { recursive: true });
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.file, "utf8"));
      for (const job of parsed.jobs ?? []) {
        if (!isExpired(job)) this.jobs.set(job.id, job);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return this;
  }

  get(id) {
    return this.jobs.get(id) ?? null;
  }

  list() {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async set(job) {
    for (const [id, stored] of this.jobs) {
      if (isExpired(stored)) this.jobs.delete(id);
    }
    this.jobs.set(job.id, job);
    await this.persist();
    return job;
  }

  async persist() {
    await fs.promises.mkdir(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    await fs.promises.writeFile(temporary, JSON.stringify({ jobs: this.list() }, null, 2));
    await fs.promises.rename(temporary, this.file);
  }
}

function isExpired(job) {
  const expiry = job.expiresAt
    ? Date.parse(job.expiresAt)
    : Date.parse(job.createdAt) + 48 * 60 * 60 * 1000;
  return !Number.isFinite(expiry) || expiry <= Date.now();
}
