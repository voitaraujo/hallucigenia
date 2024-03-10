import { HallucigeniaStateSchema } from './schemas';

type MenusThatNeedId = Extract<
	HallucigeniaStateSchema['menu'],
	'observed branches' | 'repository options' | 'delete repository'
>;
type IdType<T extends HallucigeniaStateSchema['menu']> =
	T extends MenusThatNeedId ? string : null;

export class HallucigeniaState {
	#menu;
	#repository_pulse_signals;
	#target_repository_id;

	constructor(
		menu: HallucigeniaStateSchema['menu'],
		repositoryPulseSignals: HallucigeniaStateSchema['repository_pulse_signals'],
		targetRepositoryId: HallucigeniaStateSchema['target_repository_id']
	) {
		this.#menu = menu;
		this.#repository_pulse_signals = repositoryPulseSignals;
		this.#target_repository_id = targetRepositoryId;
	}

	getMenu() {
		return this.#menu;
	}

	getRepositoryPulseSignals() {
		return this.#repository_pulse_signals;
	}

	getTargetRepository() {
		const target_repository = this.#repository_pulse_signals.find(
			(signal) => signal.conf.repository_id === this.#target_repository_id
		);

		if (!target_repository)
			throw new Error(
				'Tried to access an target repository without selecting one first'
			);

		return target_repository;
	}

	getTargetRepositoryId() {
		return this.#target_repository_id;
	}

	setMenu<T extends HallucigeniaStateSchema['menu']>(menu: T, id: IdType<T>) {
		this.#menu = menu;
		this.#target_repository_id = id || null;
	}

	setRepositoryPulseSignals(
		repositoryPulseSignals: HallucigeniaStateSchema['repository_pulse_signals']
	) {
		this.#repository_pulse_signals = repositoryPulseSignals;
	}

	removeSignalFromPulseList(repositorySlug: string) {
		this.#repository_pulse_signals = this.#repository_pulse_signals.filter(
			(signal) => signal.repository_slug !== repositorySlug
		);
	}
}
