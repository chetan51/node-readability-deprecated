/*
 *	ReadabilityWorker: Provides a WebWorker that talks to Readability
 *	so that the main server is not blocked.
 */

/*
 *	Module Dependencies
 */
var Worker       = require('webworker').Worker;
var Readability  = require('node-readability');

/*
 *	Listeners
 */
onmessage = function(message)
{
	switch (message.data.command) {
	case "grabContent":
		if (message.data.html) {
			var article = Readability.init(message.data.html, true);

			postMessage({
				title   : article.title.innerHTML,
				content : article.content.innerHTML
			});
		}
		else {
			postMessage({ error : "No HTML given." });
		}
		break;
	default:
		postMessage({ error : "Invalid command." });
		break;
	}
};

onclose = function()
{
};
