import { exec } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

import {
  APP_PATH_IDENTIFIER,
  CONFIGURATION_FILE_IDENTIFIER,
  REPOSITORIES_PATH_IDENTIFIER,
} from './constants';
import { RepositoryConfSchema } from './schemas';
import { RepositoryConf } from './types';

export class RepositoriesManager {
  #repositories: Repository[];

  constructor() {
    this.#repositories = this.#PulseRepositories();
  }

  GetRepos() {
    return this.#repositories;
  }

  GetRepo(id: string) {
    const repo = this.#repositories.find((r) => r.GetRepositoryId() === id);

    if (!repo) throw new Error('Repository not found');

    return repo;
  }

  SyncRepos() {
    this.#repositories = this.#PulseRepositories();
  }

  UncacheUnobservedBranches() {
    for (const repo of this.#repositories) {
      const cached_branches = fs
        .readdirSync(
          path.join(REPOSITORIES_PATH_IDENTIFIER, repo.GetRepositorySlug(), 'branches'),
          {
            withFileTypes: true,
          }
        )
        .filter((c) => c.isDirectory());

      for (const cb of cached_branches) {
        if (!repo.GetRepositoryConf().observed_branches.find(ob => ob.branch_name === cb.name)) {
          repo.UncacheBranch(cb.name)
        }
      }
    }
  }

  #PulseRepositories() {
    const repos: Repository[] = [];

    this.#EnsureHallucigeniaFolderExists()
    this.#EnsureRepositoriesFolderExists()

    const repos_slug = fs.readdirSync(REPOSITORIES_PATH_IDENTIFIER, {
      withFileTypes: true,
    }).filter(r => r.isDirectory());

    repos_slug.forEach((repo) => {
      this.#EnsureRepositoryFoldersExists(repo.name);

      try {
        repos.push(new Repository(repo.name))
      } catch (err: any) {
        // TODO: write the err to some log
      }
    });

    return repos;
  }

  #EnsureHallucigeniaFolderExists() {
    fs.mkdirSync(APP_PATH_IDENTIFIER, {
      recursive: true,
    });
  }

  #EnsureRepositoriesFolderExists() {
    fs.mkdirSync(REPOSITORIES_PATH_IDENTIFIER, {
      recursive: true,
    });
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

    fs.mkdirSync(path.join(REPOSITORIES_PATH_IDENTIFIER, repoSlug, 'logs'), {
      recursive: true,
    });
  }
}

export class Repository {
  #repository_slug: string

  constructor(slug: string) {
    this.#repository_slug = slug
  }

  static AttachRepository(
    repository_slug: string,
    newRepoConfParts: Pick<
      RepositoryConf,
      | 'repository_workspace_name'
      | 'repository_name'
      | 'repository_access_token'
    >
  ) {
    const id = randomUUID();

    const safe_conf_content = RepositoryConfSchema.safeParse({
      repository_id: id,
      ...newRepoConfParts,
      observed_branches: [],
      branches: [],
      remote_connection_status: 'ok',
    } satisfies RepositoryConf);

    if (!safe_conf_content.success)
      throw new Error('Invalid repository .conf');

    fs.mkdirSync(path.join(
      REPOSITORIES_PATH_IDENTIFIER, repository_slug
    ), {
      recursive: true,
    })

    fs.writeFileSync(path.join(
      REPOSITORIES_PATH_IDENTIFIER, repository_slug, CONFIGURATION_FILE_IDENTIFIER),
      JSON.stringify(safe_conf_content.data),
      {
        encoding: 'utf-8',
      }
    );

    return id;
  }

  DettachRepository() {
    fs.rmSync(path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug), {
      recursive: true,
      force: true,
    });
  }

  GetRepositoryId() {
    return this.GetRepositoryConf().repository_id
  }

  GetRepositorySlug() {
    return this.#repository_slug
  }

  GetRepositoryConf() {
    const safe_conf_content = this.#GetConfAsSafeObject(this.#repository_slug);

    if (!safe_conf_content.success) {
      throw new Error(`Failed to create the Repository class to "${this.#repository_slug}"`)
    }

    return safe_conf_content.data
  }

  UpdateRepositoryConf(
    updatedRepositoryConf: Partial<Omit<RepositoryConf, 'repository_id'>>
  ) {
    const new_repo_conf = {
      ...this.GetRepositoryConf(),
      ...updatedRepositoryConf,
    };

    // update on fs
    fs.writeFileSync(
      this.#GetConfLocationPath(this.#repository_slug),
      JSON.stringify(new_repo_conf)
    );
  }

  GetRepositoryScriptList() {
    const repo_scripts = fs
      .readdirSync(
        path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug, 'scripts'),
        {
          withFileTypes: true,
        }
      )
      .filter((s) => s.isFile() && s.name.endsWith('.txt'))
      .map((s) => s.name.split('.').at(0)!);

    return repo_scripts
  }

  GetRepositoryScriptContent(scriptName: string) {
    try {
      return fs.readFileSync(path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug, 'scripts', `${scriptName}.txt`), {
        encoding: 'utf8'
      })
    } catch (err) {
      return undefined
    }
  }

  CreateRepositoryScript(scriptName: string, newScriptContent: string) {
    fs.writeFileSync(path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug, 'scripts', `${scriptName}.txt`), newScriptContent, { encoding: 'utf8' })
  }

  DeleteRepositoryScript(scriptName: string) {
    fs.rmSync(path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug, 'scripts', `${scriptName}.txt`), {
      recursive: true,
      force: true
    })
  }

  UpdateRepositoryScript(scriptName: string, updatedScriptContent: string) {
    fs.writeFileSync(path.join(REPOSITORIES_PATH_IDENTIFIER, this.#repository_slug, 'scripts', `${scriptName}.txt`), updatedScriptContent, { encoding: 'utf8' })
  }

  async CacheBranch(branchName: string) {
    const repository_conf = this.GetRepositoryConf()
    const target_branch_folder = path.join(
      REPOSITORIES_PATH_IDENTIFIER,
      this.#repository_slug,
      'branches',
      branchName
    );

    // clear folder if it already exists
    this.UncacheBranch(branchName);

    const clone_command = `git clone -b "${branchName}" "https://x-token-auth:${repository_conf.repository_access_token}@bitbucket.org/${repository_conf.repository_workspace_name}/${repository_conf.repository_name}.git" "${target_branch_folder}"`;
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
      this.UncacheBranch(branchName);
    }

    return clone_success;
  }

  UncacheBranch(branchName: string) {
    const target_branch_folder = path.join(
      REPOSITORIES_PATH_IDENTIFIER,
      this.#repository_slug,
      'branches',
      branchName
    );

    fs.rmSync(target_branch_folder, {
      recursive: true,
      force: true,
    });
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
}

