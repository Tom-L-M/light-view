// ----- Utilities ----- //

/**
 * Returns whether an object is an object literal or other object type.
 * @param {*} value The object to test.
 * @returns {boolean}
 */
const isObjectLiteral = (value = null) => { 
    return value !== null && Object.prototype.toString.call(value) === '[object Object]' && Object.getPrototypeOf(value) === Object.prototype;
};

/**
 * Official lower-case list of HTML tags from 
 *  http://developer.mozilla.org/en-US/docs/Web/HTML/Element
 */
const HTML_TAGS = [ 
    "base", "head", "link", "meta", "style", "title", "body", "address", "article", "aside", 
    "footer", "header", "h1", "h2", "h3", "h4", "h5", "h6", "hgroup", "main", "nav", "section", 
    "search", "blockquote", "dd", "div", "dl", "dt", "figcaption", "figure", "hr", "li", "menu", 
    "ol", "p", "pre", "ul", "a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "dfn", 
    "em", "i", "kbd", "mark", "q", "rp", "rt", "ruby", "s", "samp", "small", "span", "strong", 
    "sub", "sup", "time", "u", "var", "wbr", "area", "audio", "img", "map", "track", "video", 
    "embed", "iframe", "object", "picture", "portal", "source", "svg", "math", "canvas", 
    "noscript", "script", "del", "ins", "caption", "col", "colgroup", "table", "tbody", "td", 
    "tfoot", "th", "thead", "tr", "button", "datalist", "fieldset", "form", "input", "label", 
    "legend", "meter", "optgroup", "option", "output", "progress", "select", "textarea", "details", 
    "dialog", "summary", "slot", "template", "acronym", "big", "center", "content", "dir", "font", 
    "frame", "frameset", "image", "marquee", "menuitem", "nobr", "noembed", "noframes", "param", 
    "plaintext", "rb", "rtc", "shadow", "strike", "tt", "xmp" 
];





// ----- Elements ----- //


    // ----- Internal ----- //

    /**
     * Function generator for custom tags
     * @param {string} elementName 
     * @returns {elementConstructor} A function that creates a generated element type
     * @example
     * const p = generateElementConstructor('p'); 
     * // 'p' is now a element constructor, and can be called with 'p(...)'
     */
    function generateElementConstructor (elementName) {
        /**
         * Function to create elements of a given type
         * @function elementConstructor
         * @param {...*} params SubElements/Props/Strings for creating elements of a given type
         * @returns {HTMLElement}
         * @description
         * Elements may be constructed from:
         * Options object containing any properties; 
         * Other HTML Elements (created or not with this function);
         * Strings and values with 'toString' method as direct textNodes;
         * @example
         * const p = generateElementConstructor('p'); // 'p' is now a element constructor
         * p('something', Date(), { style: 'color: red' }); // Create a P element from text value, Date value, and setting style
         */
        return function elementConstructor (...params) {
            const baseElement = document.createElement(elementName);
            for (let param of params) {
                // li(a({href: "https://example.org/"}, "example")) -> Building from options
                if (isObjectLiteral(param)) {
                    for (let prop in param) {
                        // For nested properties, such as CSS styles
                        if (isObjectLiteral(param[prop])) {
                            let subpropAcc = [];
                            for (let subprop in param[prop]) {
                                subpropAcc.push(`${subprop}: ${param[prop][subprop]};`);
                            }
                            baseElement.setAttribute(prop, subpropAcc.join(' '));
                        }
                        else {
                            // TODO:
                            // revise this:     stopImmediatePropagation() prevents that objects under others with onclick evnets trigger on wrong places
                            //                  but, it also blocks large events from bubbling in some cases - use with caution
                            if (prop.startsWith('on')) 
                                baseElement.addEventListener(
                                    prop.slice(2), 
                                    e => (
                                        typeof param[prop] === 'function' ? param[prop](e) : 
                                        (_ => param[prop])(), e.stopImmediatePropagation()
                                    ), 
                                    false
                                );

                            else baseElement.setAttribute(prop, param[prop]);
                        }
                    }
                }
            
                // ul(li("World")) -> Building from composing elements
                else if (param instanceof Element) {
                    baseElement.appendChild(param);
                }

                // li("World") -> building from string
                // li(new Date()) -> building from Date
                // (builds from anything with a 'toString' function)
                else if (typeof param?.toString === 'function') {
                    baseElement.appendChild(
                        document.createTextNode(param.toString())
                    );
                } 
            };
            return baseElement;
        }
    };


    // ----- Exported ----- //

    /**
     * Inserts elements as child of a specific DOM element (DOMRoot)
     * @param {HTMLElement} DOMRoot The DOM element to insert elements into
     * @param  {...HTMLElement} elements One, or may, HTML elements to insert
     * @returns {HTMLElement} The DOMRoot passed, for further chaining
     */
    const append = (DOMRoot, ...elements) => (elements.forEach(el => DOMRoot.appendChild(el)), DOMRoot);

    /**
     * @description 
     * An object containing HTML tag constructors
     * @example
     * const p = tags.p;
     * p('sometext'); // creates a P element with 'sometext' as textNode
     */
    const tags = Object.fromEntries(HTML_TAGS.map(v => [ v, generateElementConstructor(v) ]))
    
    /**
     * Generate a constructor function for a custom HTML tag
     * @param {string} customTagName The name of the tag to generate the constructor of
     * @returns {elementConstructor}
     * @example
     *  const ctag = customTag('ctag');
     * // Now this element can be used as:
     *  ctag('custom-tag-text', Date(), { style: 'color: red' }); 
     * // Create a custom element from text value, Date value, and setting style
     */
    const customTag = (customTagName) => generateElementConstructor(customTagName);





// ----- State Management ----- //


    // ----- Internal ----- //

    let CurrentAccessed = null;
    let CurrentBoundToRemove = [];

    /**
     * @class State
     * Exposes:
     *  State.create()
     *  <State>.value
     */
    class State {
        static create (initialValue) { return new State(initialValue); }

        static _FlushedDisposeQueue = false;
        static #flushDisposeQueue () {
            State._FlushedDisposeQueue = true;
            if (DerivedState._FlushedDisposeQueue) {
                CurrentBoundToRemove = [];
                DerivedState._FlushedDisposeQueue = false;
                State._FlushedDisposeQueue = false;
            }
        }

        #value;
        #dependents;
        constructor (initialValue = null) {
            this.#value = initialValue;
            this.#dependents = new Set();
        }

        get value () {
            if (CurrentAccessed) 
                this._subscribe(CurrentAccessed);

            // If there are items to remove, traverse searching for item to unsubscribe
            if (CurrentBoundToRemove.length > 0) {
                for (let dep of CurrentBoundToRemove) {
                    this._unsubscribe(dep);
                }
                State.#flushDisposeQueue();
            }
                
            return this.#value; 
        };

        set value (newValue) {
            // If there are items to remove, traverse searching for item to unsubscribe
            if (CurrentBoundToRemove.length > 0) {
                for (let dep of CurrentBoundToRemove) {
                    this._unsubscribe(dep);
                }
                State.#flushDisposeQueue();
            }
            if (this.#value !== newValue) {
                this.#value = newValue; 
                this.#notify();
                EffectState._runQueue();
            }
        };

        // Allows to access the value without subscribing to it
        peek () { return this.#value; }

        #notify () { for (let dep of this.#dependents) dep._update(); }

        _subscribe (dependent) { this.#dependents.add(dependent); }

        _unsubscribe (dependent) { this.#dependents.delete(dependent); }
    }

    // A DerivedState is a State that depends on other States
    /**
     * @class DerivedState
     * Exposes:
     *  DerivedState.create()
     *  <DerivedState>.value
     */
    class DerivedState {
        static create (DerivedStateFn) { return new DerivedState(DerivedStateFn); }

        static _FlushedDisposeQueue = false;
        static #flushDisposeQueue () {
            DerivedState._FlushedDisposeQueue = true;
            if (State._FlushedDisposeQueue) {
                CurrentBoundToRemove = [];
                DerivedState._FlushedDisposeQueue = false;
                State._FlushedDisposeQueue = false;
            }
        }

        #computeFn;
        #value;
        #isStale;
        #dependents;
        constructor (computeFn) {
            this.#computeFn = computeFn;
            this.#value = undefined;
            this.#isStale = true;
            this.#dependents = new Set();
        }

        get value () {
            if (this.#isStale) {
                const previousContext = CurrentAccessed;
                CurrentAccessed = this;
                this.#recompute();
                CurrentAccessed = previousContext;
            }

            if (CurrentAccessed)
                this._subscribe(CurrentAccessed);

            // If there are items to remove, traverse searching for item to unsubscribe
            if (CurrentBoundToRemove.length > 0) {
                for (let dep of CurrentBoundToRemove) {
                    this._unsubscribe(dep);
                }
                DerivedState.#flushDisposeQueue();
            }
                
            return this.#value;
        }

        #recompute () {
            this.#value = this.#computeFn();
            this.#isStale = false;
        }    
        
        // Allows to access the value without subscribing to it
        peek () { return this.#value; }

        _subscribe (dependent) { this.#dependents.add(dependent); };

        _unsubscribe (dependent) { this.#dependents.delete(dependent); };

        // Using '_' here because the method must be accessed from 
        // external class, and we can't use '#'
        _update () {
            if (!this.#isStale) {
                this.#isStale = true;
                for (let dep of this.#dependents)
                    dep._update();
            }
        }

        dispose () {
            CurrentBoundToRemove.push(this);
            for (let dep of this.#dependents) {
                if (dep.dispose) dep.dispose();
            }
        }
    }

    /**
     * Is a function that is called when a State or DerivedState changes
     * @class EffectState
     * Exposes:
     *  EffectState.create()
     */
    class EffectState {
        static create (effectStateFn) { return new EffectState(effectStateFn); }

        static #queue = [];
        static _runQueue () {
            while (EffectState.#queue.length > 0)
                EffectState.#queue.shift()._execute();
        }

        #effectStateFn;
        #isStale;
        constructor (effectStateFn) {
            this.#effectStateFn = effectStateFn;
            this.#isStale = true;
            this._execute();
        }

        _execute () {
            if (this.#isStale) {
                CurrentAccessed = this;
                this.#effectStateFn();
                CurrentAccessed = null;
            }
        }

        _update () {
            this.#isStale = true;
            this._execute();
        }

        dispose () { 
            CurrentBoundToRemove.push(this); 
        };
    }


    // ----- Exported ----- //

    /**
     * Creates an EffectState from a previous State
     * @param {Function} effectStateFn The EffectState callback function
     * @returns {EffectState}
     */
    const effect = (effectStateFn) => EffectState.create(effectStateFn);

    /**
     * Creates a State from a value
     * @param {any} value 
     * @returns {State}
     * @expose {State}.value
     */
    const state = (value) => State.create(value);

    /**
     * Creates a DerivedState from a State
     * @param {Function} derivedFn
     * @returns {DerivedState} 
     * @expose {DerivedState}.value
     */
    const derive = (derivedFn) => DerivedState.create(derivedFn);





export { append, tags, customTag, effect, state, derive };