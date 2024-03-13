function Sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

export { Sleep };
