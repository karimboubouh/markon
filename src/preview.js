import 'katex/dist/katex.min.css'
import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import morphdom from 'morphdom'
import { enhanceCallouts } from './callouts.js'
import { highlightAll } from './syntax.js'

marked.setOptions({ gfm: true, breaks: true })
marked.use(markedKatex({ throwOnError: false, strict: false }))

export const setupPreview = ({ getMarkdown, onMarkdownUpdated, previewHtml, profiler }) => {
	let renderScheduled = false
	let debounceTimer = null
	let lastRenderedContent = ''

	const render = async () => {
		const md = getMarkdown()

		// Skip render if content hasn't changed
		if (md === lastRenderedContent) {
			profiler?.markRenderComplete()
			return
		}

		// Mark when actual rendering starts (after debouncing)
		profiler?.markRenderStart()

		// Create temporary container with new content
		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = marked.parse(md)

		// Process callouts and highlighting on temp DOM
		enhanceCallouts(tempDiv)
		await highlightAll(tempDiv)

		// Use morphdom to efficiently update only changed elements
		morphdom(previewHtml, tempDiv, {
			childrenOnly: true, // Only morph children, not the container itself
			onBeforeElUpdated: (fromEl, toEl) => {
				// Preserve images that are already loaded to prevent re-fetching
				if (fromEl.tagName === 'IMG' && toEl.tagName === 'IMG') {
					if (fromEl.src === toEl.src && fromEl.complete) {
						// Keep the existing loaded image
						return false
					}
				}
				return true
			},
		})

		// Update last rendered content
		lastRenderedContent = md

		// Wait for actual paint to complete - this captures the real rendering time
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				profiler?.markRenderComplete()
			})
		})
	}

	const scheduleRender = () => {
		if (renderScheduled) return
		renderScheduled = true

		// Clear any existing debounce timer
		clearTimeout(debounceTimer)

		// Debounce rapid changes
		debounceTimer = setTimeout(() => {
			requestAnimationFrame(async () => {
				renderScheduled = false
				await render()
			})
		}, 50) // 50ms debounce for smooth typing
	}

	// Initial render
	scheduleRender()
	onMarkdownUpdated(scheduleRender)
}
