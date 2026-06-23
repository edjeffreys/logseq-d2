.PHONY: all plugin clean dev deps

all: plugin

deps:
	npm install

plugin:
	npm run build

dev:
	npm run watch

clean:
	rm -rf dist
