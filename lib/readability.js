/*
 * Utility functions
 */

var dbg = function(s) {
	if(typeof console !== 'undefined' && Readability.debugging)
		console.log("Readability: " + s);
};

/*
 * Module Dependencies
 */

var jsdom = require('jsdom');

/*
 * Readability. An Arc90 Lab Experiment. 
 * Website: http://lab.arc90.com/experiments/Readability
 * Source:  http://code.google.com/p/arc90labs-Readability
 *
 * Copyright (c) 2009 Arc90 Inc
 * Readability is licensed under the Apache License, Version 2.0.
 *
 * Modified by Chetan Surpur and Manoj Mardithaya.
**/

var Readability = {
	version:                '1.7.1',
	debugging:               1,
	biggestFrame:            false,
	bodyCache:               null,   /* Cache the body HTML in case we need to re-use it later */
	flags:                   0x1 | 0x2 | 0x4,   /* Start with all flags set. */

	/* constants */
	FLAG_STRIP_UNLIKELYS:     0x1,
	FLAG_WEIGHT_CLASSES:      0x2,
	FLAG_CLEAN_CONDITIONALLY: 0x4,

	maxPages:    30, /* The maximum number of pages to loop through before we call it quits and just show a link. */
	parsedPages: {}, /* The list of pages we've parsed in this call of Readability, for autopaging. As a key store for easier searching. */
	pageETags:   {}, /* A list of the ETag headers of pages we've parsed, in case they happen to match, we'll know it's a duplicate. */

	/**
	 * All of the regular expressions in use within Readability.
	 * Defined up here so we don't instantiate them repeatedly in loops.
	 **/
	regexps: {
		unlikelyCandidates:    /combx|comment|community|disqus|extra|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter/i,
		okMaybeItsACandidate:  /and|article|body|column|main|shadow/i,
		positive:              /article|body|content|entry|hentry|main|page|pagination|post|text|blog|story/i,
		negative:              /combx|comment|com-|contact|foot|footer|footnote|masthead|media|meta|outbrain|promo|related|scroll|shoutbox|sidebar|sponsor|shopping|tags|tool|widget/i,
		extraneous:            /print|archive|comment|discuss|e[\-]?mail|share|reply|all|login|sign|single/i,
		divToPElements:        /<(a|blockquote|dl|div|img|ol|p|pre|table|ul)/i,
		replaceBrs:            /(<br[^>]*>[ \n\r\t]*){2,}/gi,
		replaceFonts:          /<(\/?)font[^>]*>/gi,
		trim:                  /^\s+|\s+$/g,
		normalize:             /\s{2,}/g,
		killBreaks:            /(<br\s*\/?>(\s|&nbsp;?)*){1,}/g,
		videos:                /http:\/\/(www\.)?(youtube|vimeo)\.com/i,
		skipFootnoteLink:      /^\s*(\[?[a-z0-9]{1,2}\]?|^|edit|citation needed)\s*$/i,
		nextLink:              /(next|weiter|continue|>([^\|]|$)|Â»([^\|]|$))/i, // Match: next, continue, >, >>, Â» but not >|, Â»| as those usually mean last.
		prevLink:              /(prev|earl|old|new|<|Â«)/i
	},
	
	/* Function init will populate these. */
	document: '',
	articleTitle: '',
	articleContent: '',
	
	/**
	 * Retrieves article title and content.
	 *
	 * @return {title: article title, content: article content}
	 **/
	parse: function(html, preserveUnlikelyCandidates) {
		/* Convert the HTML document to a DOM object */
		document = jsdom.jsdom(html);
		
		/* Run Readability */
		Readability.init(preserveUnlikelyCandidates);
		
		return {
			title   : articleTitle,
			content : articleContent
		};
	},

	/**
	 * Runs Readability.
	 * 
	 * Workflow:
	 *  1. Prep the document by removing script tags, css, etc.
	 *  2. Parse content.
	 *  3. Grab the article content from the current dom tree.
	 *  4. Read peacefully.
	 *
	 * @return void
	 **/
	init: function(preserveUnlikelyCandidates) {
	      /* Before we do anything, remove all scripts that are not Readability. */
	      Readability.removeScripts(document);

	      if(document.body && !Readability.bodyCache) {
		      Readability.bodyCache = document.body.innerHTML;

	      }
	      /* Make sure this document is added to the list of parsed pages first, so we don't double up on the first page */
	      //Readability.parsedPages[window.location.href.replace(/\/$/, '')] = true;

	      /* Pull out any possible next page link first */
	      //var nextPageLink = Readability.findNextPageLink(document.body);

	      Readability.prepDocument();

	      /* Parse document */
	      articleTitle   = Readability.getArticleTitle();
	      articleContent = Readability.grabArticle();

	      if(!articleContent) {
		      articleContent = null;
		      nextPageLink = null;
	      }

	      articleContent = Readability.postProcessContent(articleContent);

	      /*if (nextPageLink) {
		      Readability.appendNextPage(nextPageLink);
	      }*/

	      articleContent = Readability.postProcessContent(articleContent);
	},
	
	/**
	 * Run any post-process modifications to article content as necessary.
	 * 
	 * @param Element
	 * @return void
	 **/
	postProcessContent: function(articleContent) {
		articleContent = Readability.fixImageFloats(articleContent);
		
		return articleContent;
	},
	
	/**
	 * Some content ends up looking ugly if the image is too large to be floated.
	 * If the image is wider than a threshold (currently 55%), no longer float it,
	 * center it instead.
	 *
	 * @param Element
	 * @return void
	 **/
	fixImageFloats: function (articleContent) {
		var imageWidthThreshold = Math.min(articleContent.offsetWidth, 800) * 0.55,
		images              = articleContent.getElementsByTagName('img');

		for(var i=0, il = images.length; i < il; i++) {
			var image = images[i];

			if(image.offsetWidth > imageWidthThreshold) {
				image.className += " blockImage";
			}
		}
		
		return articleContent;
	},

    /**
     * retuns the suggested direction of the string
     *
     * @return "rtl" || "ltr"
     **/
    getSuggestedDirection: function(text) {
        function sanitizeText() {
            return text.replace(/@\w+/, "");
        }
        
        function countMatches(match) {
            var matches = text.match(new RegExp(match, "g"));
            return matches != null ? matches.length : 0; 
        }
        
        function isRTL() {            
            var count_heb =  countMatches("[\\u05B0-\\u05F4\\uFB1D-\\uFBF4]");
            var count_arb =  countMatches("[\\u060C-\\u06FE\\uFB50-\\uFEFC]");

            // if 20% of chars are Hebrew or Arbic then direction is rtl
            return  (count_heb + count_arb) * 100 / text.length > 20;
        }

        text  = sanitizeText(text);
        return isRTL() ? "rtl" : "ltr";
    },

    
    /**
     * Get the article title as an H1.
     *
     * @return void
     **/
    getArticleTitle: function () {
        var curTitle = "",
            origTitle = "";

        try {
            curTitle = origTitle = document.title;
            
            if(typeof curTitle != "string") { /* If they had an element with id "title" in their HTML */
                curTitle = origTitle = Readability.getInnerText(document.getElementsByTagName('title')[0]);             
            }
        }
        catch(e) {}
        
        if(curTitle.match(/ [\|\-] /))
        {
            curTitle = origTitle.replace(/(.*)[\|\-] .*/gi,'$1');
            
            if(curTitle.split(' ').length < 3) {
                curTitle = origTitle.replace(/[^\|\-]*[\|\-](.*)/gi,'$1');
            }
        }
        else if(curTitle.indexOf(': ') !== -1)
        {
            curTitle = origTitle.replace(/.*:(.*)/gi, '$1');

            if(curTitle.split(' ').length < 3) {
                curTitle = origTitle.replace(/[^:]*[:](.*)/gi,'$1');
            }
        }
        else if(curTitle.length > 150 || curTitle.length < 15)
        {
            var hOnes = document.getElementsByTagName('h1');
            if(hOnes.length == 1)
            {
                curTitle = Readability.getInnerText(hOnes[0]);
            }
        }

        curTitle = curTitle.replace( Readability.regexps.trim, "" );

        if(curTitle.split(' ').length <= 4) {
            curTitle = origTitle;
        }
        
        var articleTitle = document.createElement("H1");
        articleTitle.innerHTML = curTitle;
        
        return articleTitle;
    },

    /**
     * Prepare the HTML document for Readability to scrape it.
     * This includes things like stripping javascript, CSS, and handling terrible markup.
     * 
     * @return void
     **/
    prepDocument: function () {
        /**
         * In some cases a body element can't be found (if the HTML is totally hosed for example)
         * so we create a new body node and append it to the document.
         */
        if(document.body === null)
        {
            var body = document.createElement("body");
            try {
                document.body = body;       
            }
            catch(e) {
                document.documentElement.appendChild(body);
                dbg(e);
            }
        }

        document.body.id = "ReadabilityBody";

        var frames = document.getElementsByTagName('frame');
        if(frames.length > 0)
        {
            var bestFrame = null;
            var bestFrameSize = 0;    /* The frame to try to run Readability upon. Must be on same domain. */
            var biggestFrameSize = 0; /* Used for the error message. Can be on any domain. */
            for(var frameIndex = 0; frameIndex < frames.length; frameIndex++)
            {
                var frameSize = frames[frameIndex].offsetWidth + frames[frameIndex].offsetHeight;
                var canAccessFrame = false;
                try {
                    frames[frameIndex].contentWindow.document.body;
                    canAccessFrame = true;
                }
                catch(eFrames) {
                    dbg(eFrames);
                }

                if(frameSize > biggestFrameSize) {
                    biggestFrameSize         = frameSize;
                    Readability.biggestFrame = frames[frameIndex];
                }
                
                if(canAccessFrame && frameSize > bestFrameSize)
                {
                    Readability.frameHack = true;
    
                    bestFrame = frames[frameIndex];
                    bestFrameSize = frameSize;
                }
            }

            if(bestFrame)
            {
                var newBody = document.createElement('body');
                newBody.innerHTML = bestFrame.contentWindow.document.body.innerHTML;
                newBody.style.overflow = 'scroll';
                document.body = newBody;
                
                var frameset = document.getElementsByTagName('frameset')[0];
                if(frameset) {
                    frameset.parentNode.removeChild(frameset); }
            }
        }

        /* Remove all stylesheets */
        for (var k=0;k < document.styleSheets.length; k++) {
            if (document.styleSheets[k].href !== null && document.styleSheets[k].href.lastIndexOf("Readability") == -1) {
                document.styleSheets[k].disabled = true;
            }
        }

        /* Remove all style tags in head (not doing this on IE) - TODO: Why not? */
        var styleTags = document.getElementsByTagName("style");
        for (var st=0;st < styleTags.length; st++) {
            styleTags[st].textContent = "";
        }

        /* Turn all double br's into p's */
        /* Note, this is pretty costly as far as processing goes. Maybe optimize later. */
        document.body.innerHTML = document.body.innerHTML.replace(Readability.regexps.replaceBrs, '</p><p>').replace(Readability.regexps.replaceFonts, '<$1span>');
    },

    /**
     * Prepare the article node for display. Clean out any inline styles,
     * iframes, forms, strip extraneous <p> tags, etc.
     *
     * @param Element
     * @return void
     **/
    prepArticle: function (articleContent) {
        Readability.cleanStyles(articleContent);
        Readability.killBreaks(articleContent);

        /* Clean out junk from the article content */
        Readability.cleanConditionally(articleContent, "form");
        Readability.clean(articleContent, "object");
        Readability.clean(articleContent, "h1");

        /**
         * If there is only one h2, they are probably using it
         * as a header and not a subheader, so remove it since we already have a header.
        ***/
        if(articleContent.getElementsByTagName('h2').length == 1) {
            Readability.clean(articleContent, "h2");
        }
        Readability.clean(articleContent, "iframe");

        Readability.cleanHeaders(articleContent);

        /* Do these last as the previous stuff may have removed junk that will affect these */
        Readability.cleanConditionally(articleContent, "table");
        Readability.cleanConditionally(articleContent, "ul");
        Readability.cleanConditionally(articleContent, "div");

        /* Remove extra paragraphs */
        var articleParagraphs = articleContent.getElementsByTagName('p');
        for(var i = articleParagraphs.length-1; i >= 0; i--) {
            var imgCount    = articleParagraphs[i].getElementsByTagName('img').length;
            var embedCount  = articleParagraphs[i].getElementsByTagName('embed').length;
            var objectCount = articleParagraphs[i].getElementsByTagName('object').length;
            
            if(imgCount === 0 && embedCount === 0 && objectCount === 0 && Readability.getInnerText(articleParagraphs[i], false) == '') {
                articleParagraphs[i].parentNode.removeChild(articleParagraphs[i]);
            }
        }

        try {
            articleContent.innerHTML = articleContent.innerHTML.replace(/<br[^>]*>\s*<p/gi, '<p');      
        }
        catch (e) {
            dbg("Cleaning innerHTML of breaks failed. This is an IE strict-block-elements bug. Ignoring.: " + e);
        }
    },
    
    /**
     * Initialize a node with the Readability object. Also checks the
     * className/id for special names to add to its score.
     *
     * @param Element
     * @return void
    **/
    initializeNode: function (node) {
        node.Readability = {"contentScore": 0};         

        switch(node.tagName) {
            case 'DIV':
                node.Readability.contentScore += 5;
                break;

            case 'PRE':
            case 'TD':
            case 'BLOCKQUOTE':
                node.Readability.contentScore += 3;
                break;
                
            case 'ADDRESS':
            case 'OL':
            case 'UL':
            case 'DL':
            case 'DD':
            case 'DT':
            case 'LI':
            case 'FORM':
                node.Readability.contentScore -= 3;
                break;

            case 'H1':
            case 'H2':
            case 'H3':
            case 'H4':
            case 'H5':
            case 'H6':
            case 'TH':
                node.Readability.contentScore -= 5;
                break;
        }
       
        node.Readability.contentScore += Readability.getClassWeight(node);
    },
    
    /***
     * grabArticle - Using a variety of metrics (content score, classname, element types), find the content that is
     *               most likely to be the stuff a user wants to read. Then return it wrapped up in a div.
     *
     * @param page a document to run upon. Needs to be a full document, complete with body.
     * @return Element
    **/
    grabArticle: function (page) {
        var stripUnlikelyCandidates = Readability.flagIsActive(Readability.FLAG_STRIP_UNLIKELYS),
            isPaging = (page !== null) ? true: false;

        page = page ? page : document.body;

        var pageCacheHtml = page.innerHTML;

        var allElements = page.getElementsByTagName('*');

        /**
         * First, node prepping. Trash nodes that look cruddy (like ones with the class name "comment", etc), and turn divs
         * into P tags where they have been used inappropriately (as in, where they contain no other block level elements.)
         *
         * Note: Assignment from index for performance. See http://www.peachpit.com/articles/article.aspx?p=31567&seqNum=5
         * TODO: Shouldn't this be a reverse traversal?
        **/
        var node = null;
        var nodesToScore = [];
        for(var nodeIndex = 0; (node = allElements[nodeIndex]); nodeIndex++) {
            /* Remove unlikely candidates */
            if (stripUnlikelyCandidates) {
                var unlikelyMatchString = node.className + node.id;
                if (
                    (
                        unlikelyMatchString.search(Readability.regexps.unlikelyCandidates) !== -1 &&
                        unlikelyMatchString.search(Readability.regexps.okMaybeItsACandidate) == -1 &&
                        node.tagName !== "BODY"
                    )
                )
                {
	                if (node.parentNode) {
		                dbg("Removing unlikely candidate - " + unlikelyMatchString);
		                node.parentNode.removeChild(node);
		                nodeIndex--;
	                }
	                continue;
                }               
            }

            if (node.tagName === "P" || node.tagName === "TD" || node.tagName === "PRE") {
                nodesToScore[nodesToScore.length] = node;
            }

            /* Turn all divs that don't have children block level elements into p's */
            if (node.tagName === "DIV") {
                if (node.innerHTML.search(Readability.regexps.divToPElements) === -1) {
                    var newNode = document.createElement('p');
                    try {
                        newNode.innerHTML = node.innerHTML;             
                        node.parentNode.replaceChild(newNode, node);
                        nodeIndex--;

                        nodesToScore[nodesToScore.length] = node;
                    }
                    catch(e) {
                        dbg("Could not alter div to p, probably an IE restriction, reverting back to div.: " + e);
                    }
                }
                else
                {
                    /* EXPERIMENTAL */
                    /*for(var i = 0, il = node.childNodes.length; i < il; i++) {
                        var childNode = node.childNodes[i];
                        if(childNode.nodeType == 3) { // Node.TEXT_NODE
                            var p = document.createElement('p');
                            p.innerHTML = childNode.nodeValue;
                            p.style.display = 'inline';
                            p.className = 'Readability-styled';
                            childNode.parentNode.replaceChild(p, childNode);
                        }
                    }*/
                }
            } 
        }

        /**
         * Loop through all paragraphs, and assign a score to them based on how content-y they look.
         * Then add their score to their parent node.
         *
         * A score is determined by things like number of commas, class names, etc. Maybe eventually link density.
        **/
        var candidates = [];
        for (var pt=0; pt < nodesToScore.length; pt++) {
            var parentNode      = nodesToScore[pt].parentNode;
            var grandParentNode = parentNode ? parentNode.parentNode : null;
            var innerText       = Readability.getInnerText(nodesToScore[pt]);

            if(!parentNode || typeof(parentNode.tagName) == 'undefined') {
                continue;
            }

            /* If this paragraph is less than 25 characters, don't even count it. */
            if(innerText.length < 25) {
                continue; }

            /* Initialize Readability data for the parent. */
            if(typeof parentNode.Readability == 'undefined') {
                Readability.initializeNode(parentNode);
                candidates.push(parentNode);
            }

            /* Initialize Readability data for the grandparent. */
            if(grandParentNode && typeof(grandParentNode.Readability) == 'undefined' && typeof(grandParentNode.tagName) != 'undefined') {
                Readability.initializeNode(grandParentNode);
                candidates.push(grandParentNode);
            }

            var contentScore = 0;

            /* Add a point for the paragraph itself as a base. */
            contentScore++;

            /* Add points for any commas within this paragraph */
            contentScore += innerText.split(',').length;
            
            /* For every 100 characters in this paragraph, add another point. Up to 3 points. */
            contentScore += Math.min(Math.floor(innerText.length / 100), 3);
            
            /* Add the score to the parent. The grandparent gets half. */
            parentNode.Readability.contentScore += contentScore;

            if(grandParentNode) {
                grandParentNode.Readability.contentScore += contentScore/2;             
            }
        }

        /**
         * After we've calculated scores, loop through all of the possible candidate nodes we found
         * and find the one with the highest score.
        **/
        var topCandidate = null;
        for(var c=0, cl=candidates.length; c < cl; c++)
        {
            /**
             * Scale the final candidates score based on link density. Good content should have a
             * relatively small link density (5% or less) and be mostly unaffected by this operation.
            **/
            candidates[c].Readability.contentScore = candidates[c].Readability.contentScore * (1-Readability.getLinkDensity(candidates[c]));

            dbg('Candidate: ' + candidates[c] + " (" + candidates[c].className + ":" + candidates[c].id + ") with score " + candidates[c].Readability.contentScore);

            if(!topCandidate || candidates[c].Readability.contentScore > topCandidate.Readability.contentScore) {
                topCandidate = candidates[c]; }
        }

        /**
         * If we still have no top candidate, just use the body as a last resort.
         * We also have to copy the body node so it is something we can modify.
         **/
        if (topCandidate === null || topCandidate.tagName == "BODY")
        {
            topCandidate = document.createElement("DIV");
            topCandidate.innerHTML = page.innerHTML;
            page.innerHTML = "";
            page.appendChild(topCandidate);
            Readability.initializeNode(topCandidate);
        }

        /**
         * Now that we have the top candidate, look through its siblings for content that might also be related.
         * Things like preambles, content split by ads that we removed, etc.
        **/
        var articleContent        = document.createElement("DIV");
        if (isPaging) {
            articleContent.id     = "Readability-content";
        }
        var siblingScoreThreshold = Math.max(10, topCandidate.Readability.contentScore * 0.2);
        var siblingNodes          = topCandidate.parentNode.childNodes;


        for(var s=0, sl=siblingNodes.length; s < sl; s++) {
            var siblingNode = siblingNodes[s];
            var append      = false;

            /**
             * Fix for odd IE7 Crash where siblingNode does not exist even though this should be a live nodeList.
             * Example of error visible here: http://www.esquire.com/features/honesty0707
            **/
            if(!siblingNode) {
                continue;
            }

            dbg("Looking at sibling node: " + siblingNode + " (" + siblingNode.className + ":" + siblingNode.id + ")" + ((typeof siblingNode.Readability != 'undefined') ? (" with score " + siblingNode.Readability.contentScore) : ''));
            dbg("Sibling has score " + (siblingNode.Readability ? siblingNode.Readability.contentScore : 'Unknown'));

            if(siblingNode === topCandidate)
            {
                append = true;
            }

            var contentBonus = 0;
            /* Give a bonus if sibling nodes and top candidates have the example same classname */
            if(siblingNode.className == topCandidate.className && topCandidate.className != "") {
                contentBonus += topCandidate.Readability.contentScore * 0.2;
            }

            if(typeof siblingNode.Readability != 'undefined' && (siblingNode.Readability.contentScore+contentBonus) >= siblingScoreThreshold)
            {
                append = true;
            }
            
            if(siblingNode.nodeName == "P") {
                var linkDensity = Readability.getLinkDensity(siblingNode);
                var nodeContent = Readability.getInnerText(siblingNode);
                var nodeLength  = nodeContent.length;
                
                if(nodeLength > 80 && linkDensity < 0.25)
                {
                    append = true;
                }
                else if(nodeLength < 80 && linkDensity === 0 && nodeContent.search(/\.( |$)/) !== -1)
                {
                    append = true;
                }
            }

            if(append) {
                dbg("Appending node: " + siblingNode);

                var nodeToAppend = null;
                if(siblingNode.nodeName != "DIV" && siblingNode.nodeName != "P") {
                    /* We have a node that isn't a common block level element, like a form or td tag. Turn it into a div so it doesn't get filtered out later by accident. */
                    
                    dbg("Altering siblingNode of " + siblingNode.nodeName + ' to div.');
                    nodeToAppend = document.createElement("DIV");
                    try {
                        nodeToAppend.id = siblingNode.id;
                        nodeToAppend.innerHTML = siblingNode.innerHTML;
                    }
                    catch(er) {
                        dbg("Could not alter siblingNode to div, probably an IE restriction, reverting back to original.");
                        nodeToAppend = siblingNode;
                        s--;
                        sl--;
                    }
                } else {
                    nodeToAppend = siblingNode;
                    s--;
                    sl--;
                }
                
                /* To ensure a node does not interfere with Readability styles, remove its classnames */
                nodeToAppend.className = "";

                /* Append sibling and subtract from our list because it removes the node when you append to another node */
                articleContent.appendChild(nodeToAppend);
            }
        }

        /**
         * So we have all of the content that we need. Now we clean it up for presentation.
        **/
        Readability.prepArticle(articleContent);

        if (Readability.curPageNum === 1) {
            articleContent.innerHTML = '<div id="Readability-page-1" class="page">' + articleContent.innerHTML + '</div>';
        }

        /**
         * Now that we've gone through the full algorithm, check to see if we got any meaningful content.
         * If we didn't, we may need to re-run grabArticle with different flags set. This gives us a higher
         * likelihood of finding the content, and the sieve approach gives us a higher likelihood of
         * finding the -right- content.
        **/
        if(Readability.getInnerText(articleContent, false).length < 250) {
        page.innerHTML = pageCacheHtml;

            if (Readability.flagIsActive(Readability.FLAG_STRIP_UNLIKELYS)) {
                Readability.removeFlag(Readability.FLAG_STRIP_UNLIKELYS);
                return Readability.grabArticle(page);
            }
            else if (Readability.flagIsActive(Readability.FLAG_WEIGHT_CLASSES)) {
                Readability.removeFlag(Readability.FLAG_WEIGHT_CLASSES);
                return Readability.grabArticle(page);
            }
            else if (Readability.flagIsActive(Readability.FLAG_CLEAN_CONDITIONALLY)) {
                Readability.removeFlag(Readability.FLAG_CLEAN_CONDITIONALLY);
                return Readability.grabArticle(page);
            } else {
                return null;
            }
        }
        
        return articleContent;
    },
    
    /**
     * Removes script tags from the document.
     *
     * @param Element
    **/
    removeScripts: function (doc) {
        var scripts = doc.getElementsByTagName('script');
        for(var i = scripts.length-1; i >= 0; i--)
        {
            if(typeof(scripts[i].src) == "undefined" || (scripts[i].src.indexOf('Readability') == -1 && scripts[i].src.indexOf('typekit') == -1))
            {
                scripts[i].nodeValue="";
                scripts[i].removeAttribute('src');
		if (scripts[i].parentNode) {
	                scripts[i].parentNode.removeChild(scripts[i]);          
		}
            }
        }
    },
    
    /**
     * Get the inner text of a node - cross browser compatibly.
     * This also strips out any excess whitespace to be found.
     *
     * @param Element
     * @return string
    **/
    getInnerText: function (e, normalizeSpaces) {
        var textContent    = "";

        if(typeof(e.textContent) == "undefined" && typeof(e.innerText) == "undefined") {
            return "";
        }

        normalizeSpaces = (typeof normalizeSpaces == 'undefined') ? true : normalizeSpaces;

        textContent = e.textContent.replace( Readability.regexps.trim, "" );

        if(normalizeSpaces) {
            return textContent.replace( Readability.regexps.normalize, " "); }
        else {
            return textContent; }
    },

    /**
     * Get the number of times a string s appears in the node e.
     *
     * @param Element
     * @param string - what to split on. Default is ","
     * @return number (integer)
    **/
    getCharCount: function (e,s) {
        s = s || ",";
        return Readability.getInnerText(e).split(s).length-1;
    },

    /**
     * Remove the style attribute on every e and under.
     * TODO: Test if getElementsByTagName(*) is faster.
     *
     * @param Element
     * @return void
    **/
    cleanStyles: function (e) {
        e = e || document;
        var cur = e.firstChild;

        if(!e) {
            return; }

        // Remove any root styles, if we're able.
        if(typeof e.removeAttribute == 'function' && e.className != 'Readability-styled') {
            e.removeAttribute('style'); }

        // Go until there are no more child nodes
        while ( cur !== null ) {
            if ( cur.nodeType == 1 ) {
                // Remove style attribute(s) :
                if(cur.className != "Readability-styled") {
                    cur.removeAttribute("style");                   
                }
                Readability.cleanStyles( cur );
            }
            cur = cur.nextSibling;
        }           
    },
    
    /**
     * Get the density of links as a percentage of the content
     * This is the amount of text that is inside a link divided by the total text in the node.
     * 
     * @param Element
     * @return number (float)
    **/
    getLinkDensity: function (e) {
        var links      = e.getElementsByTagName("a");
        var textLength = Readability.getInnerText(e).length;
        var linkLength = 0;
        for(var i=0, il=links.length; i<il;i++)
        {
            linkLength += Readability.getInnerText(links[i]).length;
        }       

        return linkLength / textLength;
    },
    
    /**
     * Find a cleaned up version of the current URL, to use for comparing links for possible next-pageyness.
     *
     * @author Dan Lacy
     * @return string the base url
    **/
    findBaseUrl: function () {
        var noUrlParams     = window.location.pathname.split("?")[0],
            urlSlashes      = noUrlParams.split("/").reverse(),
            cleanedSegments = [],
            possibleType    = "";

        for (var i = 0, slashLen = urlSlashes.length; i < slashLen; i++) {
            var segment = urlSlashes[i];

            // Split off and save anything that looks like a file type.
            if (segment.indexOf(".") !== -1) {
                possibleType = segment.split(".")[1];

                /* If the type isn't alpha-only, it's probably not actually a file extension. */
                if(!possibleType.match(/[^a-zA-Z]/)) {
                    segment = segment.split(".")[0];                    
                }
            }
            
            /**
             * EW-CMS specific segment replacement. Ugly.
             * Example: http://www.ew.com/ew/article/0,,20313460_20369436,00.html
            **/
            if(segment.indexOf(',00') !== -1) {
                segment = segment.replace(',00', '');
            }

            // If our first or second segment has anything looking like a page number, remove it.
            if (segment.match(/((_|-)?p[a-z]*|(_|-))[0-9]{1,2}$/i) && ((i === 1) || (i === 0))) {
                segment = segment.replace(/((_|-)?p[a-z]*|(_|-))[0-9]{1,2}$/i, "");
            }


            del = false;

            /* If this is purely a number, and it's the first or second segment, it's probably a page number. Remove it. */
            if (i < 2 && segment.match(/^\d{1,2}$/)) {
                del = true;
            }
            
            /* If this is the first segment and it's just "index", remove it. */
            if(i === 0 && segment.toLowerCase() == "index")
                del = true;

            /* If our first or second segment is smaller than 3 characters, and the first segment was purely alphas, remove it. */
            if(i < 2 && segment.length < 3 && !urlSlashes[0].match(/[a-z]/i))
                del = true;

            /* If it's not marked for deletion, push it to cleanedSegments. */
            if (!del) {
                cleanedSegments.push(segment);
            }
        }

        // This is our final, cleaned, base article URL.
        return window.location.protocol + "//" + window.location.host + cleanedSegments.reverse().join("/");
    },

    /**
     * Look for any paging links that may occur within the document.
     * 
     * @param body
     * @return object (array)
    **/
    findNextPageLink: function (elem) {
        var possiblePages = {},
            allLinks = elem.getElementsByTagName('a'),
            articleBaseUrl = Readability.findBaseUrl();

        /* Hack for NYTimes print view erroneous multipage. Fixed in new version, this is a short term fix. */
        if (window.location.hostname == "www.nytimes.com" && window.location.search.indexOf("pagewanted=print") !== -1) {
            return null;
        }

        /**
         * Loop through all links, looking for hints that they may be next-page links.
         * Things like having "page" in their textContent, className or id, or being a child
         * of a node with a page-y className or id.
         *
         * Also possible: levenshtein distance? longest common subsequence?
         *
         * After we do that, assign each page a score, and 
        **/
        for(i = 0, il = allLinks.length; i < il; i++) {
            var link     = allLinks[i],
                linkHref = allLinks[i].href.replace(/#.*$/, '').replace(/\/$/, '');

            /* If we've already seen this page, ignore it */
            if(linkHref == "" || linkHref == articleBaseUrl || linkHref == window.location.href || linkHref in Readability.parsedPages) {
                continue;
            }
            
            /* If it's on a different domain, skip it. */
            if(window.location.host != linkHref.split(/\/+/g)[1]) {
                continue;
            }
            
            var linkText = Readability.getInnerText(link);

            /* If the linkText looks like it's not the next page, skip it. */
            if(linkText.match(Readability.regexps.extraneous) || linkText.length > 25) {
                continue;
            }

            /* If the leftovers of the URL after removing the base URL don't contain any digits, it's certainly not a next page link. */
            var linkHrefLeftover = linkHref.replace(articleBaseUrl, '');
            if(!linkHrefLeftover.match(/\d/)) {
                continue;
            }
            
            if(!(linkHref in possiblePages)) {
                possiblePages[linkHref] = {"score": 0, "linkText": linkText, "href": linkHref};             
            } else {
                possiblePages[linkHref].linkText += ' | ' + linkText;
            }

            linkObj = possiblePages[linkHref];

            /**
             * If the articleBaseUrl isn't part of this URL, penalize this link. It could still be the link, but the odds are lower.
             * Example: http://www.actionscript.org/resources/articles/745/1/JavaScript-and-VBScript-Injection-in-ActionScript-3/Page1.html
            **/
            if(linkHref.indexOf(articleBaseUrl) !== 0) {
                linkObj.score -= 25;
            }

            var linkData = linkText + ' ' + link.className + ' ' + link.id;
            if(linkData.match(Readability.regexps.nextLink)) {
                linkObj.score += 50;
            }
            if(linkData.match(/pag(e|ing|inat)/i)) {
                linkObj.score += 25;
            }
            if(linkData.match(/(first|last)/i)) { // -65 is enough to negate any bonuses gotten from a > or Â» in the text, 
                /* If we already matched on "next", last is probably fine. If we didn't, then it's bad. Penalize. */
                if(!linkObj.linkText.match(Readability.regexps.nextLink)) 
                    linkObj.score -= 65;              
            }
            if(linkData.match(Readability.regexps.negative) || linkData.match(Readability.regexps.extraneous)) {
                linkObj.score -= 50;
            }
            if(linkData.match(Readability.regexps.prevLink)) {
                linkObj.score -= 200;
            }

            /* If a parentNode contains page or paging or paginat */
            var parentNode = link.parentNode,
                positiveNodeMatch = false,
                negativeNodeMatch = false;
            while(parentNode) {
                var parentNodeClassAndId = parentNode.className + ' ' + parentNode.id;
                if(!positiveNodeMatch && parentNodeClassAndId && parentNodeClassAndId.match(/pag(e|ing|inat)/i)) {
                    positiveNodeMatch = true;
                    linkObj.score += 25;
                }
                if(!negativeNodeMatch && parentNodeClassAndId && parentNodeClassAndId.match(Readability.regexps.negative)) {
                    /* If this is just something like "footer", give it a negative. If it's something like "body-and-footer", leave it be. */
                    if(!parentNodeClassAndId.match(Readability.regexps.positive)) {
                        linkObj.score -= 25;
                        negativeNodeMatch = true;                       
                    }
                }
                
                parentNode = parentNode.parentNode;
            }

            /**
             * If the URL looks like it has paging in it, add to the score.
             * Things like /page/2/, /pagenum/2, ?p=3, ?page=11, ?pagination=34
            **/
            if (linkHref.match(/p(a|g|ag)?(e|ing|ination)?(=|\/)[0-9]{1,2}/i) || linkHref.match(/(page|paging)/i)) {
                linkObj.score += 25;
            }

            /* If the URL contains negative values, give a slight decrease. */
            if (linkHref.match(Readability.regexps.extraneous)) {
                linkObj.score -= 15;
            }

            /**
             * Minor punishment to anything that doesn't match our current URL.
             * NOTE: I'm finding this to cause more harm than good where something is exactly 50 points.
             *       Dan, can you show me a counterexample where this is necessary?
             * if (linkHref.indexOf(window.location.href) !== 0) {
             *    linkObj.score -= 1;
             * }
            **/

            /**
             * If the link text can be parsed as a number, give it a minor bonus, with a slight
             * bias towards lower numbered pages. This is so that pages that might not have 'next'
             * in their text can still get scored, and sorted properly by score.
            **/
            linkTextAsNumber = parseInt(linkText, 10);
            if(linkTextAsNumber) {
                // Punish 1 since we're either already there, or it's probably before what we want anyways.
                if (linkTextAsNumber === 1) {
                    linkObj.score -= 10;
                }
                else {
                    // Todo: Describe this better
                    linkObj.score += Math.max(0, 10 - linkTextAsNumber);
                }
            }
        }

        /**
         * Loop thrugh all of our possible pages from above and find our top candidate for the next page URL.
         * Require at least a score of 50, which is a relatively high confidence that this page is the next link.
        **/
        var topPage = null;
        for(var page in possiblePages) {
            if(possiblePages.hasOwnProperty(page)) {
                if(possiblePages[page].score >= 50 && (!topPage || topPage.score < possiblePages[page].score)) {
                    topPage = possiblePages[page];
                }
            }
        }

        if(topPage) {
            var nextHref = topPage.href.replace(/\/$/,'');

            dbg('NEXT PAGE IS ' + nextHref);
            Readability.parsedPages[nextHref] = true;
            return nextHref;            
        }
        else {
            return null;
        }
    },

    /**
     * Build a simple cross browser compatible XHR.
     *
     * TODO: This could likely be simplified beyond what we have here right now. There's still a bit of excess junk.
    **/
    xhr: function () {
        if (typeof XMLHttpRequest !== 'undefined' && (window.location.protocol !== 'file:' || !window.ActiveXObject)) {
            return new XMLHttpRequest();
        }
        else {
            try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch(sixerr) { }
            try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch(threrr) { }
            try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(err) { }
        }

        return false;
    },

    successfulRequest: function (request) {
        return (request.status >= 200 && request.status < 300) || request.status == 304 || (request.status === 0 && request.responseText);
    },

    ajax: function (url, options) {
        var request = Readability.xhr();

        function respondToReadyState(readyState) {
            if (request.readyState == 4) {
                if (Readability.successfulRequest(request)) {
                    if (options.success) { options.success(request); }
                }
                else {
                    if (options.error) { options.error(request); }
                }
            }
        }

        if (typeof options === 'undefined') { options = {}; }

        request.onreadystatechange = respondToReadyState;
        
        request.open('get', url, true);
        request.setRequestHeader('Accept', 'text/html');

        try {
            request.send(options.postBody);
        }
        catch (e) {
            if (options.error) { options.error(); }
        }

        return request;
    },

    /**
     * Make an AJAX request for each page and append it to the document.
    **/
    curPageNum: 1,

    appendNextPage: function (nextPageLink) {
        Readability.curPageNum++;

        var articlePage       = document.createElement("DIV");
        articlePage.id        = 'Readability-page-' + Readability.curPageNum;
        articlePage.className = 'page';
        articlePage.innerHTML = '<p class="page-separator" title="Page ' + Readability.curPageNum + '">&sect;</p>';

        document.getElementById("Readability-content").appendChild(articlePage);

        if(Readability.curPageNum > Readability.maxPages) {
            var nextPageLink = "<div style='text-align: center'><a href='" + nextPageLink + "'>View Next Page</a></div>";

            articlePage.innerHTML = articlePage.innerHTML + nextPageLink;
            return;
        }
        
        /**
         * Now that we've built the article page DOM element, get the page content
         * asynchronously and load the cleaned content into the div we created for it.
         *
         * Todo: try using a self-calling function rather than with
         *
         * Yes, "with statement is considered harmful". But this is using with as a replacement for let which is in ecmascript 1.7, so it's okay.
         * See here: http://stackoverflow.com/questions/61552/are-there-legitimate-uses-for-javascripts-with-statement#answer-185283
        **/
        with({pageUrl: nextPageLink, thisPage: articlePage}) {
            Readability.ajax(pageUrl, {
                success: function(r) {

                    /* First, check to see if we have a matching ETag in headers - if we do, this is a duplicate page. */
                    var eTag = r.getResponseHeader('ETag');
                    if(eTag) {
                        if(eTag in Readability.pageETags) {
                            dbg("Exact duplicate page found via ETag. Aborting.");
                            articlePage.style.display = 'none';
                            return;
                        } else {
                            Readability.pageETags[eTag] = 1;
                        }                       
                    }

                    // TODO: this ends up doubling up page numbers on NYTimes articles. Need to generically parse those away.
                    var page = document.createElement("DIV");

                    /**
                     * Do some preprocessing to our HTML to make it ready for appending.
                     * â€¢ Remove any script tags. Swap and reswap newlines with a unicode character because multiline regex doesn't work in javascript.
                     * â€¢ Turn any noscript tags into divs so that we can parse them. This allows us to find any next page links hidden via javascript.
                     * â€¢ Turn all double br's into p's - was handled by prepDocument in the original view.
                     *   Maybe in the future abstract out prepDocument to work for both the original document and AJAX-added pages.
                    **/
                    var responseHtml = r.responseText.
                                        replace(/\n/g,'\uffff').replace(/<script.*?>.*?<\/script>/gi, '').
                                        replace(/\uffff/g,'\n').
                                        replace(/<(\/?)noscript/gi, '<$1div').
                                        replace(Readability.regexps.replaceBrs, '</p><p>').
                                        replace(Readability.regexps.replaceFonts, '<$1span>');
                    
                    page.innerHTML = responseHtml;

                    /**
                     * Reset all flags for the next page, as they will search through it and disable as necessary at the end of grabArticle.
                    **/
                    Readability.flags = 0x1 | 0x2 | 0x4;

                    var nextPageLink = Readability.findNextPageLink(page),
                        content      =  Readability.grabArticle(page);

                    if(!content) {
                        dbg("No content found in page to append. Aborting.")
                        return;
                    }

                    /**
                     * Anti-duplicate mechanism. Essentially, get the first paragraph of our new page.
                     * Compare it against all of the the previous document's we've gotten. If the previous
                     * document contains exactly the innerHTML of this first paragraph, it's probably a duplicate.
                    **/
                    firstP = content.getElementsByTagName("P").length ? content.getElementsByTagName("P")[0] : null;
                    if(firstP && firstP.innerHTML.length > 100) {
                        for(var i=1; i <= Readability.curPageNum; i++) {
                            var rPage = document.getElementById('Readability-page-' + i);
                            if(rPage && rPage.innerHTML.indexOf(firstP.innerHTML) !== -1) {
                                dbg('Duplicate of page ' + i + ' - skipping.');
                                articlePage.style.display = 'none';
                                Readability.parsedPages[pageUrl] = true;
                                return;
                            }
                        }
                    }
                    
                    Readability.removeScripts(content);

                    thisPage.innerHTML = thisPage.innerHTML + content.innerHTML;

                    /**
                     * After the page has rendered, post process the content. This delay is necessary because,
                     * in webkit at least, offsetWidth is not set in time to determine image width. We have to
                     * wait a little bit for reflow to finish before we can fix floating images.
                    **/
                    window.setTimeout(
                        function() { Readability.postProcessContent(thisPage); },
                        500
                    );

                    if(nextPageLink) {
                        Readability.appendNextPage(nextPageLink);
                    }
                }
            });
        }
    },
    
    /**
     * Get an elements class/id weight. Uses regular expressions to tell if this 
     * element looks good or bad.
     *
     * @param Element
     * @return number (Integer)
    **/
    getClassWeight: function (e) {
        if(!Readability.flagIsActive(Readability.FLAG_WEIGHT_CLASSES)) {
            return 0;
        }

        var weight = 0;

        /* Look for a special classname */
        if (typeof(e.className) === 'string' && e.className != '')
        {
            if(e.className.search(Readability.regexps.negative) !== -1) {
                weight -= 25; }

            if(e.className.search(Readability.regexps.positive) !== -1) {
                weight += 25; }
        }

        /* Look for a special ID */
        if (typeof(e.id) === 'string' && e.id != '')
        {
            if(e.id.search(Readability.regexps.negative) !== -1) {
                weight -= 25; }

            if(e.id.search(Readability.regexps.positive) !== -1) {
                weight += 25; }
        }

        return weight;
    },

    nodeIsVisible: function (node) {
        return (node.offsetWidth !== 0 || node.offsetHeight !== 0) && node.style.display.toLowerCase() !== 'none';
    },

    /**
     * Remove extraneous break tags from a node.
     *
     * @param Element
     * @return void
     **/
    killBreaks: function (e) {
        try {
            e.innerHTML = e.innerHTML.replace(Readability.regexps.killBreaks,'<br />');       
        }
        catch (eBreaks) {
            dbg("KillBreaks failed - this is an IE bug. Ignoring.: " + eBreaks);
        }
    },

    /**
     * Clean a node of all elements of type "tag".
     * (Unless it's a youtube/vimeo video. People love movies.)
     *
     * @param Element
     * @param string tag to clean
     * @return void
     **/
    clean: function (e, tag) {
        var targetList = e.getElementsByTagName( tag );
        var isEmbed    = (tag == 'object' || tag == 'embed');
        
        for (var y=targetList.length-1; y >= 0; y--) {
            /* Allow youtube and vimeo videos through as people usually want to see those. */
            if(isEmbed) {
                var attributeValues = "";
                for (var i=0, il=targetList[y].attributes.length; i < il; i++) {
                    attributeValues += targetList[y].attributes[i].value + '|';
                }
                
                /* First, check the elements attributes to see if any of them contain youtube or vimeo */
                if (attributeValues.search(Readability.regexps.videos) !== -1) {
                    continue;
                }

                /* Then check the elements inside this element for the same. */
                if (targetList[y].innerHTML.search(Readability.regexps.videos) !== -1) {
                    continue;
                }
                
            }

            targetList[y].parentNode.removeChild(targetList[y]);
        }
    },
    
    /**
     * Clean an element of all tags of type "tag" if they look fishy.
     * "Fishy" is an algorithm based on content length, classnames, link density, number of images & embeds, etc.
     *
     * @return void
     **/
    cleanConditionally: function (e, tag) {

        if(!Readability.flagIsActive(Readability.FLAG_CLEAN_CONDITIONALLY)) {
            return;
        }

        var tagsList      = e.getElementsByTagName(tag);
        var curTagsLength = tagsList.length;

        /**
         * Gather counts for other typical elements embedded within.
         * Traverse backwards so we can remove nodes at the same time without effecting the traversal.
         *
         * TODO: Consider taking into account original contentScore here.
        **/
        for (var i=curTagsLength-1; i >= 0; i--) {
            var weight = Readability.getClassWeight(tagsList[i]);
            var contentScore = (typeof tagsList[i].Readability != 'undefined') ? tagsList[i].Readability.contentScore : 0;
            
            dbg("Cleaning Conditionally " + tagsList[i] + " (" + tagsList[i].className + ":" + tagsList[i].id + ")" + ((typeof tagsList[i].Readability != 'undefined') ? (" with score " + tagsList[i].Readability.contentScore) : ''));

            if(weight+contentScore < 0)
            {
                tagsList[i].parentNode.removeChild(tagsList[i]);
            }
            else if ( Readability.getCharCount(tagsList[i],',') < 10) {
                /**
                 * If there are not very many commas, and the number of
                 * non-paragraph elements is more than paragraphs or other ominous signs, remove the element.
                **/
                var p      = tagsList[i].getElementsByTagName("p").length;
                var img    = tagsList[i].getElementsByTagName("img").length;
                var li     = tagsList[i].getElementsByTagName("li").length-100;
                var input  = tagsList[i].getElementsByTagName("input").length;

                var embedCount = 0;
                var embeds     = tagsList[i].getElementsByTagName("embed");
                for(var ei=0,il=embeds.length; ei < il; ei++) {
                    if (embeds[ei].src && embeds[ei].src.search(Readability.regexps.videos) == -1) {
                      embedCount++; 
                    }
                }

                var linkDensity   = Readability.getLinkDensity(tagsList[i]);
                var contentLength = Readability.getInnerText(tagsList[i]).length;
                var toRemove      = false;

                if ( img > p ) {
                    toRemove = true;
                } else if(li > p && tag != "ul" && tag != "ol") {
                    toRemove = true;
                } else if( input > Math.floor(p/3) ) {
                    toRemove = true; 
                } else if(contentLength < 25 && (img === 0 || img > 2) ) {
                    toRemove = true;
                } else if(weight < 25 && linkDensity > 0.2) {
                    toRemove = true;
                } else if(weight >= 25 && linkDensity > 0.5) {
                    toRemove = true;
                } else if((embedCount == 1 && contentLength < 75) || embedCount > 1) {
                    toRemove = true;
                }

                if(toRemove) {
                    tagsList[i].parentNode.removeChild(tagsList[i]);
                }
            }
        }
    },

    /**
     * Clean out spurious headers from an Element. Checks things like classnames and link density.
     *
     * @param Element
     * @return void
    **/
    cleanHeaders: function (e) {
        for (var headerIndex = 1; headerIndex < 3; headerIndex++) {
            var headers = e.getElementsByTagName('h' + headerIndex);
            for (var i=headers.length-1; i >=0; i--) {
                if (Readability.getClassWeight(headers[i]) < 0 || Readability.getLinkDensity(headers[i]) > 0.33) {
                    headers[i].parentNode.removeChild(headers[i]);
                }
            }
        }
    },

    htmlspecialchars: function (s) {
        if (typeof(s) == "string") {
            s = s.replace(/&/g, "&amp;");
            s = s.replace(/"/g, "&quot;");
            s = s.replace(/'/g, "&#039;");
            s = s.replace(/</g, "&lt;");
            s = s.replace(/>/g, "&gt;");
        }
    
        return s;
    },

    flagIsActive: function(flag) {
        return (Readability.flags & flag) > 0;
    },
    
    addFlag: function(flag) {
        Readability.flags = Readability.flags | flag;
    },
    
    removeFlag: function(flag) {
        Readability.flags = Readability.flags & ~flag;
    }
    
};

module.exports = Readability;
