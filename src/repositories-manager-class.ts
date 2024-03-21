import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  CONFIGURATION_FILE_IDENTIFIER,
  REPOSITORIES_PATH_IDENTIFIER,
} from './constants';
import { RepositoryConfSchema } from './schemas';
import { RepositoryConf, RepositoryPulseSignal } from './types';

export class RepositoriesManager {
  #repositories;

  constructor() {
    this.#repositories = this.#PulseRepositories();
  }

  GetRepos() {
    return this.#repositories;
  }

  GetRepo(id: string) {
    const t = this.#repositories.find((r) => r.conf.repository_id === id);

    if (!t) throw new Error('Repository not found');

    return t;
  }

  SyncRepos() {
    this.#repositories = this.#PulseRepositories();
  }

  AttachRepository(
    newRepoConfParts: Pick<
      RepositoryConf,
      | 'repository_workspace_name'
      | 'repository_name'
      | 'repository_access_token'
    >,
    newRepoSlug: string
  ) {
    const id = randomUUID();

    const safe_conf_content = RepositoryConfSchema.safeParse({
      repository_id: id,
      ...newRepoConfParts,
      observed_branches: [],
      branches: [],
      remote_connection_status: 'ok',
    } satisfies RepositoryConf);

    if (safe_conf_content.success) {


      fs.writeFileSync(path.join(
        REPOSITORIES_PATH_IDENTIFIER, newRepoSlug, CONFIGURATION_FILE_IDENTIFIER),
        JSON.stringify(safe_conf_content.data),
        {
          encoding: 'utf-8',
        }
      );

      return id;
    }

    throw new Error('Invalid repository .conf');
  }

  DettachRepository(repoId: string) {
    const to_delete = this.#repositories.find(r => r.conf.repository_id === repoId)

    if (!!to_delete) {
      fs.rmSync(path.join(REPOSITORIES_PATH_IDENTIFIER, to_delete.repository_slug), {
        recursive: true,
        force: true,
      });
    }
  }

  UpdateRepository(
    repoId: string,
    updatedRepositoryConf: Partial<Omit<RepositoryConf, 'repository_id'>>
  ) {
    const repo = this.#repositories.find(
      (r) => r.conf.repository_id === repoId
    );

    if (!repo) throw new Error('Repository not found');

    const safe_conf_content = this.#GetConfAsSafeObject(repo.repository_slug);

    if (!safe_conf_content.success)
      throw new Error("can't find .conf file to update");
    if (repo.conf.repository_id !== safe_conf_content.data.repository_id)
      throw new Error(".conf id's from cache and disk don't match");

    const new_repo_conf = {
      ...repo.conf,
      ...updatedRepositoryConf,
    };

    // update on fs
    fs.writeFileSync(
      this.#GetConfLocationPath(repo.repository_slug),
      JSON.stringify(new_repo_conf)
    );

    // update on cached
    this.#repositories = this.#repositories.map((r) =>
      r.conf.repository_id === repo.conf.repository_id
        ? {
          repository_slug: r.repository_slug,
          conf: new_repo_conf,
          scripts: r.scripts,
        }
        : r
    );
  }

  async CacheBranch(repoId: string, branchName: string) {
    const repo = this.#repositories.find(
      (r) => r.conf.repository_id === repoId
    );

    if (!repo) throw new Error('Repository not found');

    const target_branch_folder = path.join(
      REPOSITORIES_PATH_IDENTIFIER,
      repo.repository_slug,
      'branches',
      branchName
    );

    // clear folder if it already exists
    this.UncacheBranch(repoId, branchName);

    const clone_command = `git clone -b "${branchName}" "https://x-token-auth:${repo.conf.repository_access_token}@bitbucket.org/${repo.conf.repository_workspace_name}/${repo.conf.repository_name}.git" "${target_branch_folder}"`;
    const command = exec(clone_command);

    const clone_success = await new Promise<boolean>((resolve) => {
      command.on('exit', (code, _) => {
        if (code !== 0) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });

    // clear folder if the clone wasn't successful
    if (!clone_success) {
      this.UncacheBranch(repoId, branchName);
    }

    return clone_success;
  }

  UncacheBranch(repoId: string, branchName: string) {
    const repo = this.#repositories.find(
      (r) => r.conf.repository_id === repoId
    );

    if (!repo) throw new Error('Repository not found');

    const target_branch_folder = path.join(
      REPOSITORIES_PATH_IDENTIFIER,
      repo.repository_slug,
      'branches',
      branchName
    );

    fs.rmSync(target_branch_folder, {
      recursive: true,
      force: true,
    });
  }

  UncacheUnobservedBranches() {
    const repos = fs
      .readdirSync(REPOSITORIES_PATH_IDENTIFIER, {
        withFileTypes: true,
      })
      .filter((r) => r.isDirectory());

    for (const repo of repos) {
      const cached_branches = fs
        .readdirSync(
          path.join(REPOSITORIES_PATH_IDENTIFIER, repo.name, 'branches'),
          {
            withFileTypes: true,
          }
        )
        .filter((c) => c.isDirectory());

      for (const cached_branch of cached_branches) {
        const r = this.#repositories.find(
          (r) => r.repository_slug === repo.name
        );

        if (!r) throw new Error('Repository not found');

        if (
          !r.conf.observed_branches.find(
            (o) => o.branch_name === cached_branch.name
          )
        ) {
          this.UncacheBranch(r.conf.repository_id, cached_branch.name);
        }
      }
    }
  }

  #GetConfAsSafeObject(repoSlug: string) {
    const repository_conf_path = this.#GetConfLocationPath(repoSlug);
    let obj;

    try {
      const conf_content = fs
        .readFileSync(repository_conf_path, {
          encoding: 'utf-8',
        })
        .toString();

      obj = JSON.parse(conf_content);
    } catch (e) {
      obj = {};
    }

    return RepositoryConfSchema.safeParse(obj);
  }

  #GetConfLocationPath(repoSlug: string) {
    return path.join(
      REPOSITORIES_PATH_IDENTIFIER,
      repoSlug,
      CONFIGURATION_FILE_IDENTIFIER
    );
  }

  #PulseRepositories() {
    const signals: RepositoryPulseSignal[] = [];

    if (!fs.existsSync(REPOSITORIES_PATH_IDENTIFIER)) {
      fs.mkdirSync(REPOSITORIES_PATH_IDENTIFIER, {
        recursive: true,
      });

      return signals;
    }

    const repos_slug = fs.readdirSync(REPOSITORIES_PATH_IDENTIFIER, {
      withFileTypes: true,
    });

    repos_slug.forEach((repo) => {
      if (repo.isFile()) return;

      const safe_conf_content = this.#GetConfAsSafeObject(repo.name);
      this.#EnsureRepositoryFoldersExists(repo.name);

      const repo_scripts = fs
        .readdirSync(
          path.join(REPOSITORIES_PATH_IDENTIFIER, repo.name, 'scripts'),
          {
            withFileTypes: true,
          }
        )
        .filter((s) => s.isFile())
        .map((s) => s.name.split('.').at(0) || s.name);

      if (safe_conf_content.success) {
        signals.push({
          repository_slug: repo.name,
          conf: safe_conf_content.data,
          scripts: repo_scripts,
        });
      }
    });

    return signals;
  }

  #EnsureRepositoryFoldersExists(repoSlug: string) {
    fs.mkdirSync(path.join(REPOSITORIES_PATH_IDENTIFIER, repoSlug, 'branches'), {
      recursive: true,
    });

    fs.mkdirSync(path.join(REPOSITORIES_PATH_IDENTIFIER, repoSlug, 'tmp'), {
      recursive: true,
    });

    fs.mkdirSync(path.join(REPOSITORIES_PATH_IDENTIFIER, repoSlug, 'scripts'), {
      recursive: true,
    });
  }
}
