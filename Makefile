.PHONY: check validate docs-check act act-ci help

ACT_IMAGE ?= ghcr.io/catthehacker/ubuntu:act-24.04

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

check: ## Check JavaScript syntax
	node --check index.js
	node --check post.js

validate: check ## Validate action.yml structure
	@node -e " \
		const fs = require('fs'); \
		const yaml = fs.readFileSync('action.yml', 'utf8'); \
		if (!yaml.includes('name:')) throw new Error('action.yml missing name'); \
		if (!yaml.includes('description:')) throw new Error('action.yml missing description'); \
		if (!yaml.includes('runs:')) throw new Error('action.yml missing runs'); \
		console.log('action.yml structure OK'); \
	"

docs-check: ## Check README and docs against action.yml and index.js
	node docs/scripts/check-docs.js

act-ci: ## Run CI workflow locally with act
	act push \
		--workflows .github/workflows/ci.yml \
		--platform ubuntu-latest=$(ACT_IMAGE)

act: act-ci ## Run all act workflows (alias for act-ci)
