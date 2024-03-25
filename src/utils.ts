import os from 'os';

function Sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

function GetPlatformScriptingExtension() {
	return os.platform() === 'win32' ? '.bat' : '.sh';
}

export { GetPlatformScriptingExtension, Sleep };
