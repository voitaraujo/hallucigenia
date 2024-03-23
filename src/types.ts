import { z } from 'zod';

import { RepositoryConfSchema } from './schemas';

export type RepositoryConf = z.infer<typeof RepositoryConfSchema>;

export type menu =
	| 'home'
	| 'watch mode'
	| 'repositories'
	| 'add repository'
	| 'check repos'
	| 'repository options'
	| 'branches'
	| 'side effects'
	| 'delete repository'
	| 'check branches'
	| 'quit';

