import { menu } from './types';

type MenusThatNeedId = Extract<
  menu,
  | 'observed branches'
  | 'repository options'
  | 'delete repository'
  | 'side effects branches'
  | 'check branches'
  | 'branches'
>;
type IdType<T extends menu> = T extends MenusThatNeedId ? string : null;

export class HallucigeniaState {
  #menu: menu;
  #target_repository_id: string | null;

  constructor() {
    this.#menu = 'home';
    this.#target_repository_id = null;
  }

  getMenu() {
    return this.#menu;
  }

  getTargetRepositoryId() {
    if (!this.#target_repository_id) throw new Error('No target repository id');

    return this.#target_repository_id;
  }

  setMenu<T extends menu>(menu: T, id: IdType<T>) {
    this.#menu = menu;
    this.#target_repository_id = id || null;
  }
}
