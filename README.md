## node-readability ##

This is a port of [Arc90's Readability](http://lab.arc90.com/experiments/readability/) to [Node](http://nodejs.org/).

### Dependencies ###

Requires:

*	Node.js
*	[jsdom](https://github.com/tmpvar/jsdom) v0.1.20+
*	[webworker](https://github.com/pgriess/node-webworker) v0.8.2+ (optional, but recommended)

### Usage ###

Since Readability is a complex and synchronous script, it will block your server each time it is run. That's why we recommend you use the provided node webworker (`ReadabilityWorker.js`) to interface with Readability to make it asynchronous and non-blocking.

#### Example ####

	var Worker = require('webworker').Worker;

	var w = new Worker(path.join(__dirname, 'ReadabilityWorker.js'));

	w.onmessage = function(message)
	{
		if (message.data.title && message.data.content) {
			console.log("Article title: " + message.data.title);
			console.log("Article content: " + message.data.content);
		}
		else if (message.data.error) {
			console.log("Unable to grab content from document. Error: " + message.data.error);
		}
		else {
			console.log("Something went horribly wrong.");
		}
		
		w.terminate();
	};

	w.postMessage({
		command : 'grabContent',
		html    : html
	});
	
### Contributors ###

This port is by [Manoj Mardithaya](https://github.com/vanwaril) and [Chetan Surpur](http://chetansurpur.com/).