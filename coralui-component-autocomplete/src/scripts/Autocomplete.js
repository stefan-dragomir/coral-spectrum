/*
 * ADOBE CONFIDENTIAL
 *
 * Copyright 2017 Adobe Systems Incorporated
 * All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 */

import Component from 'coralui-mixin-component';
import FormField from 'coralui-mixin-formfield';
import {Tag} from 'coralui-component-taglist';
import {SelectableCollection} from 'coralui-collection';
import AutocompleteItem from './AutocompleteItem';
import 'coralui-component-icon';
import 'coralui-component-button';
import 'coralui-component-list';
import 'coralui-component-overlay';
import 'coralui-component-textfield';
import 'coralui-component-wait';
import base from '../templates/base';
import loadIndicator from '../templates/loadIndicator';
import {transform, validate, commons, i18n} from 'coralui-util';

const CLASSNAME = 'coral3-Autocomplete';

/**
 The distance, in pixels, from the bottom of the List at which we assume the user has scrolled
 to the bottom of the list.
 @type {Number}
 @ignore
 */
const SCROLL_BOTTOM_THRESHOLD = 50;

/**
 The number of milliseconds for which scroll events should be debounced.
 @type {Number}
 @ignore
 */
const SCROLL_DEBOUNCE = 100;

// @temp - Enable debug messages when writing tests
const DEBUG = 0;

/**
 Enumeration of match values.
 
 @enum {String}
 @memberof Coral.Autocomplete
 */
const match = {
  /** Include only matches that start with the user provided value. */
  STARTSWITH: 'startswith',
  /** Include only matches that contain the user provided value. */
  CONTAINS: 'contains'
};

/**
 @class Coral.Autocomplete
 @classdesc An Autocomplete component
 @htmltag coral-autocomplete
 @extends HTMLElement
 @extends Coral.mixin.component
 @extends Coral.mixin.formField
 */
class Autocomplete extends FormField(Component(HTMLElement)) {
  constructor() {
    super();
    
    // Template
    this._elements = {};
    base.call(this._elements);
    
    this._elements.tagList.reset = () => {
      // Kill inner tagList reset so it doesn't interfer with the autocomplete reset
    };
    
    // Events
    this._delegateEvents({
      // ARIA Autocomplete role keyboard interaction
      // http://www.w3.org/TR/wai-aria-practices/#autocomplete
      'key:up [handle="input"]': '_handleInputUpKeypress',
      'key:alt+up [handle="input"]': '_handleInputUpKeypress',
      'key:down [handle="input"]': '_handleInputDownKeypress',
      'key:alt+down [handle="input"]': '_handleInputDownKeypress',
      'key:tab [handle="input"]': '_handleInputTabKeypress',
      'key:shift+tab [handle="input"]': '_handleListFocusShift',
      'capture:change [handle="input"]': '_handleInput',
      'input [handle="input"]': '_handleInputEvent',
  
      // Manually listen to keydown event due to CUI-3973
      'keydown': '_handleInputKeypressEnter',
  
      // Interaction
      'click [handle="trigger"]': '_handleTriggerClick',
      'mousedown [handle="trigger"]': '_handleTriggerMousedown',
      'key:escape': '_hideSuggestionsAndFocus',
      'key:shift+tab [is="coral-buttonlist-item"]': '_handleListFocusShift',
  
      // Focus
      'capture:blur': '_handleFocusOut',
      'capture:focus [handle="inputGroup"]': '_handleInputGroupFocusIn',
      'capture:blur [handle="inputGroup"]': '_handleInputGroupFocusOut',
  
      // Taglist
      'coral-collection:remove [handle="tagList"]': '_handleTagRemoved',
      'change [handle="tagList"]': '_preventTagListChangeEvent',
  
      // SelectList
      // Needed for ButtonList
      'key:enter button[is="coral-buttonlist-item"]': '_handleSelect',
      'click button[is="coral-buttonlist-item"]': '_handleSelect',
      'capture:scroll [handle="overlay"]': '_onScroll',
      'capture:mousewheel [handle="overlay"]': '_onMouseWheel',
      'mousedown button[is="coral-buttonlist-item"]': '_handleSelect',
      'capture:mouseenter [is="coral-buttonlist-item"]': '_handleListItemFocus',
  
      // Overlay
      'coral-overlay:positioned': '_handleOverlayPositioned',
  
      // Items
      'coral-autocomplete-item:_valuechanged': '_handleItemValueChange',
      'coral-autocomplete-item:_selectedchanged': '_handleItemSelectedChange',
      'coral-autocomplete-item:_contentchanged': '_handleItemContentChange'
    });
  
    // A map of values to tags
    this._tagMap = {};
  
    // A list of selected values
    this._values = [];
  
    // A list of options objects
    this._options = [];
  
    // A map of option values to their content
    this._optionsMap = {};
  
    // Used for reset
    this._initialSelectedValues = [];
  
    // Bind the debounced scroll method
    this._handleScrollBottom = this._handleScrollBottom.bind(this);
  
    // Listen for mutations
    this._observer = new MutationObserver(this._handleMutation.bind(this));
    this._startObserving();
  }
  
  /**
   The item collection.
   See {@link Coral.Collection} for more details.
   
   @type {Coral.Collection}
   @readonly
   @memberof Coral.Autocomplete#
   */
  get items() {
    // Construct the collection on first request:
    if (!this._items) {
      this._items = new SelectableCollection({
        itemTagName: 'coral-autocomplete-item',
        host: this
      });
    }
  
    return this._items;
  }
  
  /**
   Indicates if the autocomplete is a single or multiple mode. In multiple mode, the user can select multiple
   values.
   
   @type {Boolean}
   @default false
   @htmlattribute multiple
   @htmlattributereflected
   @memberof Coral.Autocomplete#
   */
  get multiple() {
    return this._multiple || false;
  }
  set multiple(value) {
    this._multiple = transform.booleanAttr(value);
    this._reflectAttribute('multiple', this._multiple);
    
    this._setName(this.name);
  
    if (this._multiple) {
      this._elements.tagList.hidden = false;
    }
    else {
      this._elements.tagList.hidden = true;
      this._elements.tagList.items.clear();
    }
  
    this.labelledBy = this.labelledBy;
  }
  
  /**
   Amount of time, in milliseconds, to wait after typing a character before the suggestion is shown.
   
   @type {Number}
   @default 200
   @htmlattribute delay
   @memberof Coral.Autocomplete#
   */
  get delay() {
    return typeof this._delay === 'number' ? this._delay : 200;
  }
  set delay(value) {
    value = transform.number(value);
  
    if (typeof value === 'number' && value >= 0) {
      this._delay = transform.number(value);
    }
  }
  
  /**
   Set to <code>true</code> to restrict the selected value to one of the given options from the suggestions.
   When set to <code>false</code>, users can enter anything.
   
   <strong>NOTE:</strong> This API is under review and may be removed or changed in a subsequent release.
   @ignore
   
   @type {Boolean}
   @default false
   @htmlattribute forceselection
   @htmlattributereflected
   @memberof Coral.Autocomplete#
   */
  get forceSelection() {
    return this._forceSelection || false;
  }
  set forceSelection(value) {
    this._forceSelection = transform.booleanAttr(value);
    this._reflectAttribute('forceselection', this._forceSelection);
  
    if (DEBUG) {
      console.warn('Coral.Autocomplete: Should check for invalid state');
    }
  }
  
  /**
   A hint to the user of what can be entered.
   
   @type {String}
   @default ""
   @htmlattribute placeholder
   @htmlattributereflected
   @memberof Coral.Autocomplete#
   */
  get placeholder() {
    return this._elements.input.placeholder;
  }
  set placeholder(value) {
    this._elements.input.placeholder = value;
    this._reflectAttribute('placeholder', this.placeholder);
  }
  
  /**
   Max length for the Input field
   
   @type {Long}
   @htmlattribute maxlength
   @htmlattributereflected
   @memberof Coral.Autocomplete#
   */
  get maxLength() {
    return this._elements.input.maxLength;
  }
  set maxLength(value) {
    this._elements.input.maxLength = value;
    this._reflectAttribute('maxlength', this._elements.input.maxLength);
  }
  
  /**
   The icon of the autocomplete.
   
   @type {String}
   @default ""
   @htmlattribute icon
   @htmlattributereflected
   @memberof Coral.Autocomplete#
   */
  get icon() {
    return this._elements.icon.icon;
  }
  set icon(value) {
    this._elements.icon.icon = value;
    
    // Hide if no icon provided
    this._elements.icon.hidden = !this._elements.icon.icon;
  }
  
  /**
   The match mode.
 
   @type {Coral.Autocomplete.match}
   @default Coral.Autocomplete.match.CONTAINS
   @htmlattribute match
   @memberof Coral.Autocomplete#
   */
  get match() {
    return this._match || match.CONTAINS;
  }
  set match(value) {
    if (typeof value === 'function') {
      this._match = value;
      this._matchFunction = value;
    }
    else {
      value = transform.string(value).toLowerCase();
      this._match = validate.enumeration(match)(value) && value || match.CONTAINS;
  
      if (this._match === match.STARTSWITH) {
        this._matchFunction = this._optionStartsWithValue;
      }
      else if (this._match === match.CONTAINS) {
        this._matchFunction = this._optionContainsValue;
      }
    }
  }
  
  /**
   Indicates that the component is currently loading remote data. This will set the wait indicator inside the list.
   
   @type {Boolean}
   @default false
   @htmlattribute loading
   @memberof Coral.Autocomplete#
   */
  get loading() {
    return this._loading || false;
  }
  set loading(value) {
    this._loading = transform.booleanAttr(value);
    
    let load = this._elements.loadIndicator;
    
    if (this._loading) {
      const overlay = this._elements.overlay;
  
      // we decide first if we need to scroll to the bottom since adding the load will change the dimentions
      const scrollToBottom = overlay.scrollTop >= overlay.scrollHeight - overlay.clientHeight;
      
      // if it does not exist we create it
      if (!load) {
        load = this._elements.loadIndicator = loadIndicator.call(this._elements).firstChild;
      }
    
      // inserts the item at the end
      this._elements.overlay.appendChild(load);
    
      // we make the load indicator visible
      if (scrollToBottom) {
        overlay.scrollTop = overlay.scrollHeight;
      }
    }
    else if (load && load.parentNode) {
      this._elements.overlay.removeChild(load);
    }
  }
  
  /**
   Returns an Array containing the set selected items.
   @type {Array.<HTMLElement>}
   @readonly
   @memberof Coral.Autocomplete#
   */
  get selectedItems() {
    return this.items._getAllSelected();
  }
  
  /**
   Returns the first selected item in the Autocomplete. The value <code>null</code> is returned if no element is
   selected.
   @type {?HTMLElement}
   @readonly
   @memberof Coral.Autocomplete#
   */
  get selectedItem() {
    return this.items._getAllSelected()[0] || null;
  }
  
  /**
   The current value, as submitted during form submission.
   When {@link Coral.Autocomplete#multiple} is <code>true</code>, the first selected value will be returned.
   
   @type {String}
   @default ""
   @htmlattribute value
   @memberof Coral.Autocomplete#
   */
  get value() {
    // Get the first value (or empty string)
    const values = this.values;
    return values && values.length > 0 ? values[0] : '';
  }
  set value(value) {
    this.values = [transform.string(value)];
  }
  
  /**
   The current values, as submitted during form submission.
   When {@link Coral.Autocomplete#multiple} is <code>false</code>, this will be an array of length 1.
   
   @type {Array.<String>}
   @memberof Coral.Autocomplete#
   */
  get values() {
    return this._values;
  }
  set values(values) {
    if (values === undefined || values === null) {
      values = [];
    }
    
    if (Array.isArray(values)) {
      // if value was set to empty string
      if (values.length === 1 && values[0] === '') {
        values = [];
      }
      
      let i;
      let value;
      const selectedValues = [];
  
      // Valid values only
      if (this.forceSelection) {
        // Add each valid value
        for (i = 0; i < values.length; i++) {
          value = values[i];
          if (this._optionsMap[value] !== undefined) {
            selectedValues.push(value);
          }
        }
      }
      // Any value goes
      else {
        for (i = 0; i < values.length; i++) {
          value = values[i];
          selectedValues.push(value);
        }
      }
  
      if (this.multiple) {
        // Remove existing tags, DOM selection, etc
        // This is a full override
        this._clearValues();
    
        // Add each tag
        for (i = 0; i < selectedValues.length; i++) {
          value = selectedValues[i];
      
          // Ensure the item is selected if it's present in the DOM
          // This keeps the DOM in sync with the JS API and prevents bugs like CUI-5681
          this._selectItem(value);
      
          // Add the value to the tag list
          this._addValue(value, null, true);
        }
      }
      else {
        // Set value
        this._values = selectedValues.length > 0 ? [selectedValues[0]] : [];
        this._reflectCurrentValue();
      }
    }
  }
  
  // JSDoc inherited
  get name() {
    return this._getName();
  }
  set name(value) {
    this._reflectAttribute('name', value);
  
    this._setName(value);
  }
  
  // JSDoc inherited
  get invalid() {
    return super.invalid;
  }
  set invalid(value) {
    super.invalid = value;
  
    // Add to outer component
    this.classList.toggle('is-invalid', this.invalid);
    this._elements.input.classList.toggle('is-invalid', this.invalid);
  }
  
  // JSDoc inherited
  get disabled() {
    return this._disabled || false;
  }
  set disabled(value) {
    this._disabled = transform.booleanAttr(value);
    this._reflectAttribute('disabled', this._disabled);
    
    this.setAttribute('aria-disabled', this._disabled);
    this.classList.toggle('is-disabled', this._disabled);
    
    this._elements.input.disabled = this._disabled;
    this._elements.trigger.disabled = this._disabled || this.readOnly;
    this._elements.tagList.disabled = this._disabled || this.readOnly;
  }
  
  // JSDoc inherited
  get readOnly() {
    return this._readOnly || false;
  }
  set readOnly(value) {
    this._readOnly = transform.booleanAttr(value);
    this._reflectAttribute('readonly', this._readOnly);
    this.setAttribute('aria-readonly', this._readOnly);
  
    this._elements.input.readOnly = this._readOnly;
    this._elements.trigger.disabled = this._readOnly || this.disabled;
  }
  
  // JSDoc inherited
  get required() {
    return this._required || false;
  }
  set required(value) {
    this._required = transform.booleanAttr(value);
    this._reflectAttribute('required', this._required);
    
    this.setAttribute('aria-required', this._required);
    this._elements.input.required = this._required;
  }
  
  // JSDoc inherited
  get labelledBy() {
    return super.labelledBy;
  }
  set labelledBy(value) {
    super.labelledBy = value;
    
    if (this.labelledBy && this.multiple) {
      this._elements.tagList.setAttribute('aria-labelledby', this.labelledBy);
    }
    else {
      this._elements.tagList.removeAttribute('aria-labelledby');
    }
  }
  
  /** @private */
  _getName() {
    if (this.multiple) {
      return this._elements.tagList.name;
    }
    
    return this._elements.field.name;
  }
  
  /**
   Set the name accordingly for multiple/single mode so the form submits contain only the right fields.
   
   @private
   */
  _setName(value) {
    if (this.multiple) {
      this._elements.tagList.name = value;
      this._elements.field.name = '';
    }
    else {
      this._elements.field.name = value;
      this._elements.tagList.name = '';
    }
  }
  
  /** @private */
  _startObserving() {
    this._observer.observe(this, {
      // Only watch the childList
      // Items will tell us if selected/value/content changes
      childList: true
    });
  }
  
  /**
   Stop watching for mutations. This should be done before manually updating observed properties.
   
   @protected
   */
  _stopObserving() {
    this._observer.disconnect();
  }
  
  // Override to do nothing
  _onInputChange(event) {
    // stops the current event
    event.stopPropagation();
    
    if (!this.multiple) {
      
      const inputText = this._elements.input.value.toLowerCase();
      
      if (this.forceSelection || inputText === '') {
        // We need a way to deselect item in single selection mode
        // 1) by using an empty string if this.forceSelection === false
        // 2) by using an invalid string if this.forceSelection === true
        const items = this.items.getAll();
        for (let i = 0; i < items.length; i++) {
          if (items[i].value.toLowerCase() !== inputText) {
            items[i].selected = false;
          }
        }
      }
    }
  }
  
  /**
   Handle mutations to children and childList. This is used to keep the options in sync with DOM changes.
   
   @private
   */
  _handleMutation(mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      const target = mutation.target;
      
      if (mutation.type === 'childList' && target === this) {
        this._setStateFromDOM();
        return;
      }
    }
  }
  
  /**
   Update the option set and selected options from the DOM.
   
   @private
   */
  _setStateFromDOM() {
    this._createOptionsFromDOM();
    this._setSelectedFromDOM();
  }
  
  /**
   Create the set of options from nodes in the DOM.
   
   @private
   */
  _createOptionsFromDOM() {
    // Reset options array and value to content map
    this._options.length = 0;
    this._optionsMap = {};
    
    this.items.getAll().forEach((item) => {
      // Don't use properties as children may not be initialized yet
      const itemObj = {
        value: item.getAttribute('value'),
        icon: item.getAttribute('icon'),
        disabled: item.hasAttribute('disabled'),
        content: item.innerHTML,
        text: item.innerText
      };
      this._options.push(itemObj);
      this._optionsMap[itemObj.value] = itemObj;
    });
    
    // @todo update value in hidden field if changed value = old value?
  }
  
  /** @private */
  _setInputValues(value, content) {
    this._elements.field.value = value;
    
    // Set text into input if in "multiple selection mode" or in "single selection mode and content is not empty"
    // otherwise keep the current text for us (should be marked red)
    if (this.multiple || content !== '') {
      this._elements.input.value = content.trim();
    }
  }
  
  /** @private */
  _reflectCurrentValue() {
    // Use empty string if no values
    const value = this._values.length > 0 ? this._values[0] : '';
    
    // Reflect the value in the field for form submit
    this._elements.field.value = value;
    
    let content = '';
    if (value !== '') {
      // Find the object with the corresponding content
      const itemObj = this._optionsMap[value];
      
      if (itemObj) {
        // Reflect the content in the input
        content = itemObj.content;
      }
      else {
        // Just use the provided value
        content = value;
      }
    }
    
    this._setInputValues(value, content);
  }
  
  /**
   Update the option set and selected options from the DOM
   @ignore
   */
  _setSelectedFromDOM() {
    const selectedItems = this.selectedItems;
    
    if (selectedItems.length) {
      // Use this.hasAttribute('multiple') instead of this.multiple here, as this method is called from _render and element might not be ready
      if (this.hasAttribute('multiple')) {
        // Remove current tags
        this._resetValues();
        
        // Add new ones
        for (let i = 0; i < selectedItems.length; i++) {
          const value = selectedItems[i].getAttribute('value');
          const content = selectedItems[i].innerHTML;
          this._addValue(value, content, true);
        }
      }
      else {
        // Select last
        const last = selectedItems[selectedItems.length - 1];
        
        // Deselect others
        this._deselectExcept(last, selectedItems);
        
        // Set value from the attribute
        // We don't want to use the property as the sub-component may not have been upgraded yet
        this.value = last.getAttribute('value');
      }
    }
    // Use this.hasAttribute('multiple') instead of this.multiple here, as this method is called from _render and element might not be ready
    else if (this.hasAttribute('multiple')) {
      this._resetValues();
    }
    else {
      this.value = '';
    }
  }
  
  /**
   De-select every item except the provided item.
   
   @param {HTMLElement} exceptItem
   The item not to select
   @param {Array.<HTMLElement>} [items]
   The set of items to consider when deselecting. If not provided, the current set of selected items is used.
   
   @private
   */
  _deselectExcept(exceptItem, items) {
    const selectedItems = items || this.selectedItems;
    
    // Deselect others
    this._stopObserving();
    for (let i = 0; i < selectedItems.length; i++) {
      if (selectedItems[i] !== exceptItem) {
        selectedItems[i].removeAttribute('selected');
      }
    }
    this._startObserving();
  }
  
  /**
   Add a tag to the taglist.
   
   @private
   */
  _addValue(value, content, asHTML) {
    if (!content) {
      // Find the content
      const itemObj = this._optionsMap[value];
      if (itemObj) {
        content = itemObj.content;
      }
      else {
        // Just use the value
        content = value;
        
        if (DEBUG) {
          console.warn('Coral.Autocomplete: Did not have content for value %s', value);
        }
      }
    }
    
    // Add to selected values
    const index = this._values.indexOf(value);
    if (index === -1) {
      this._values.push(value);
    }
    else if (DEBUG) {
      console.warn('Coral.Autocomplete: Tried to add value that was already present');
    }
    
    const labelContent = {};
    if (asHTML) {
      labelContent.innerHTML = content;
    }
    else {
      labelContent.textContent = content;
    }
    
    // Create a new tag
    const tag = new Tag().set({
      label: labelContent,
      value: value
    });
    
    // Add to map
    this._tagMap[value] = tag;
    
    // Add to taglist
    this._elements.tagList.items.add(tag);
    
    // make sure to remove text from input box (to easily choose next item)
    this._setInputValues('', '');
  }
  
  /**
   Remove a tag from the taglist.
   
   @private
   */
  _removeValue(value) {
    // Remove from selected values
    const index = this._values.indexOf(value);
    
    if (index === -1) {
      if (DEBUG) {
        console.warn('Coral.Autocomplete: Tried to remove tag that is not in values');
      }
      // Get out if we don't have the value
      return;
    }
    
    this._values.splice(index, 1);
    
    // Select autocomplete item
    const item = this.querySelector(`coral-autocomplete-item[value=${JSON.stringify(value)}]`);
    
    if (item) {
      if (item.hasAttribute('selected')) {
        this._stopObserving();
        item.removeAttribute('selected');
        this._startObserving();
      }
    }
    else if (DEBUG) {
      console.warn('Coral.Autocomplete: Tried to remove value without corresponding item');
    }
    
    // Look up the tag by value
    const tag = this._tagMap[value];
    
    if (tag) {
      // Remove from map
      this._tagMap[value] = null;
      
      // Remove from taglist
      this._elements.tagList.items.remove(tag);
    }
    
    if (index !== -1) {
      // Emit the change event when a value is removed but only after a user interaction
      this.trigger('change');
    }
  }
  
  /**
   Remove all tags from the taglist.
   
   @private
   */
  _clearValues() {
    this._resetValues();
    
    // Deselect items
    this._stopObserving();
    const items = this.querySelectorAll('coral-autocomplete-item[selected]');
    for (let i = 0; i < items.length; i++) {
      items[i].removeAttribute('selected');
    }
    
    this._startObserving();
  }
  
  /**
   Reset values without affecting the DOM.
   
   @private
   */
  _resetValues() {
    // Reset values
    this._values = [];
    
    // Drop references to tags
    this._tagMap = {};
    
    // Clear taglist
    this._elements.tagList.items.clear();
  }
  
  /** @private */
  _focusNextItem() {
    // Display focus on next item in the selectList
    const selectList = this._elements.selectList;
    const currentItem = selectList.querySelector('.is-focused');
    const input = this._elements.input;
    const items = selectList._getSelectableItems();
    let index;
    let item;
    const self = this;
    
    if (currentItem) {
      index = items.indexOf(currentItem);
      if (index < items.length - 1) {
        item = items[index + 1];
      }
    }
    else if (items && items.length > 0) {
      item = items[0];
    }
    
    window.requestAnimationFrame(() => {
      if (item) {
        if (currentItem) {
          currentItem.classList.remove('is-focused');
        }
        self._scrollItemIntoView(item);
        item.classList.add('is-focused');
        input.setAttribute('aria-activedescendant', item.id);
      }
      if (!selectList.querySelector('.is-focused')) {
        input.removeAttribute('aria-activedescendant');
      }
    });
  }
  
  /** @private */
  _focusPreviousItem() {
    // Display focus on previous item in the selectList
    const selectList = this._elements.selectList;
    const currentItem = selectList.querySelector('.is-focused');
    const input = this._elements.input;
    const items = selectList._getSelectableItems();
    let index;
    let item;
    const self = this;
    
    if (currentItem) {
      index = items.indexOf(currentItem);
      if (index > 0) {
        item = items[index - 1];
      }
      currentItem.classList.remove('is-focused');
    }
    else if (items && items.length > 0) {
      item = items[items.length - 1];
    }
    
    window.requestAnimationFrame(() => {
      if (item) {
        self._scrollItemIntoView(item);
        item.classList.add('is-focused');
        input.setAttribute('aria-activedescendant', item.id);
      }
      if (!selectList.querySelector('.is-focused')) {
        input.removeAttribute('aria-activedescendant');
      }
    });
  }
  
  /** @private */
  _showSuggestions() {
    // Get value from the input
    const inputValue = this._elements.input.value.toLowerCase().trim();
    
    // Since we're showing fresh suggestions, clear the existing suggestions
    this.clearSuggestions();
    
    // Trigger an event
    const event = this.trigger('coral-autocomplete:showsuggestions', {
      // Pass user input
      value: inputValue,
      // Started at zero here, always
      start: 0
    });
    
    // Flag to indicate that the private method is called before public showSuggestions method
    this._showSuggestionsCalled = true;
    
    if (event.defaultPrevented) {
      // Set loading mode
      this.loading = true;
      
      // Show the menu
      this.showSuggestions();
    }
    else {
      // Show suggestions that match in the DOM
      this.addSuggestions(this._getMatches(inputValue, this._optionContainsValue));
      this.showSuggestions();
    }
  }
  
  /** @private */
  _onScroll() {
    window.clearTimeout(this._scrollTimeout);
    this._scrollTimeout = window.setTimeout(this._handleScrollBottom, SCROLL_DEBOUNCE);
  }
  
  /** @private */
  _onMouseWheel(event) {
    const overlay = this._elements.overlay;
    // If scrolling with mouse wheel and if it has hit the top or bottom boundary
    // `SCROLL_BOTTOM_THRESHOLD` is ignored when hitting scroll bottom to allow debounced loading
    if (event.deltaY < 0 && overlay.scrollTop === 0 || event.deltaY > 0 && overlay.scrollTop >= overlay.scrollHeight - overlay.clientHeight) {
      event.preventDefault();
    }
  }
  
  /** @private */
  _handleScrollBottom() {
    const overlay = this._elements.overlay;
    const selectList = this._elements.selectList;
    
    if (overlay.scrollTop >= overlay.scrollHeight - overlay.clientHeight - SCROLL_BOTTOM_THRESHOLD) {
      const inputValue = this._elements.input.value;
      
      // Do not clear the suggestions here, instead we'll expect them to append
      
      // Trigger an event
      const event = this.trigger('coral-autocomplete:showsuggestions', {
        // Pass user input
        value: inputValue,
        start: selectList.items.length
      });
      
      if (event.defaultPrevented) {
        // Set loading mode
        this.loading = true;
      }
    }
  }
  
  /** @private */
  _handleFocusOut(event) {
    const self = this;
    const selectList = this._elements.selectList;
    const target = event.target;
    const inputBlur = target === this._elements.input;
    
    if (this._blurTimeout) {
      clearTimeout(this._blurTimeout);
    }
    
    // This is to hack around the fact that you cannot determine which element gets focus in a blur event
    // Firefox doesn't support focusout/focusin, so we're left doing awful things
    this._blurTimeout = window.setTimeout(() => {
      const relatedTarget = document.activeElement;
      const focusOutside = !self.contains(relatedTarget);
      
      // If focus has moved out of the autocomplete, it's an input event
      if (inputBlur && focusOutside && !self.multiple) {
        self._handleInput(event);
      }
      // Nothing was focused
      else if (!relatedTarget || ((inputBlur || relatedTarget !== document.body) &&
        // Focus is now outside of the autocomplete component
        focusOutside ||
        // Focus has shifted from the selectList to another element inside of the autocomplete component
        selectList.contains(target) && !selectList.contains(relatedTarget))) {
        self.hideSuggestions();
      }
    }, 0);
  }
  
  /** @private */
  _handleInputGroupFocusIn() {
    this.classList.add('is-focused');
  }
  
  /** @private */
  _handleInputGroupFocusOut() {
    this.classList.remove('is-focused');
  }
  
  /** @private */
  _handleOverlayPositioned(event) {
    // We'll remove these classes when closed
    if (event.detail.vertical === 'top') {
      this.classList.remove('is-openAbove');
      this.classList.add('is-openBelow');
    }
    else {
      this.classList.remove('is-openBelow');
      this.classList.add('is-openAbove');
    }
  }
  
  /** @private */
  _handleListFocusShift(event) {
    if (this._elements.overlay.open) {
      // Stop focus shift
      event.preventDefault();
      event.stopImmediatePropagation();
      
      this._hideSuggestionsAndFocus();
    }
  }
  
  /** @private */
  _hideSuggestionsAndFocus() {
    // Hide the menu and focus on the input
    this.hideSuggestions();
    this._elements.input.focus();
  }
  
  /** @private */
  _handleTriggerClick() {
    if (this._elements.overlay.open) {
      this._hideSuggestionsAndFocus();
    }
    else {
      // Focus on the input so down arrow works as expected
      // Per @mijordan
      this._showSuggestions();
      this._elements.input.focus();
    }
  }
  
  /** @private */
  _handleTriggerMousedown() {
    this._elements.trigger.focus();
  }
  
  /** @private */
  _handleListItemFocus(event) {
    const item = event.matchedTarget;
    const selectList = this._elements.selectList;
    const currentItem = selectList.querySelector('.is-focused');
    const input = this._elements.input;
    
    if (currentItem) {
      currentItem.classList.remove('is-focused');
      input.removeAttribute('aria-activedescendant');
    }
    if (!item.disabled) {
      this._scrollItemIntoView(item);
      item.classList.add('is-focused');
      input.setAttribute('aria-activedescendant', item.id);
    }
  }
  
  /** @private */
  _scrollItemIntoView(item) {
    const itemRect = item.getBoundingClientRect();
    const overlayRect = this._elements.overlay.getBoundingClientRect();
    if (itemRect.top < overlayRect.top) {
      item.scrollIntoView();
    }
    else if (itemRect.bottom > overlayRect.bottom) {
      item.scrollIntoView(false);
    }
  }
  
  /** @private */
  _getMatches(value, optionMatchesValue) {
    optionMatchesValue = optionMatchesValue || this._matchFunction;
    
    const matches = [];
    
    for (let i = 0; i < this._options.length; i++) {
      if (optionMatchesValue(this._options[i], value)) {
        matches.push(this._options[i]);
      }
    }
    
    if (!matches.length) {
      // If there are no matches in _options,
      // Check for matches in list, which could have been added after mounting the element
      const buttons = this._elements.selectList.items.getAll();
      for (let i = 0; i < buttons.length; i++) {
        const option = {
          value: buttons[i].value,
          content: buttons[i].textContent.trim()
        };
        if (optionMatchesValue(option, value)) {
          matches.push(option);
        }
      }
    }
    
    return matches;
  }
  
  /** @private */
  _handleInputKeypressEnter(event) {
    // Sigh, CUI-3973 Hitting enter quickly after typing causes form to submit
    if (event.which === 13) {
      this._handleInput(event);
    }
  }
  
  /** @private */
  _handleInputEvent() {
    // Any input makes this valid again
    this.invalid = false;
    
    if (this.delay) {
      // Wait until the use has stopped typing for delay milliseconds before getting suggestions
      window.clearTimeout(this.timeout);
      this.timeout = setTimeout(this._showSuggestions.bind(this), this.delay);
    }
    else {
      // Immediately get suggestions
      this._showSuggestions();
    }
  }
  
  /** @private */
  _handleInput(event) {
    let focusedItemValue;
    
    // Stop the event
    event.preventDefault();
    
    // If a selectList item has focus, set the input value to the value of the selected item.
    if (this._elements.overlay.open && this._elements.input.getAttribute('aria-activedescendant')) {
      const focusedItem = this._elements.selectList.querySelector('.is-focused');
      if (focusedItem) {
        // Use the text content value of the item for comparison
        focusedItemValue = focusedItem.textContent.trim();
      }
    }
    
    const value = focusedItemValue || this._elements.input.value;
    
    let isChange = false;
    
    // Get all exact matches
    const exactMatches = this._getMatches(value, this._optionEqualsValue);
    
    if (exactMatches.length) {
      // Find perfect case sensitive match else defaults to first one
      const exactMatch = exactMatches.filter((option) => option.content === value)[0] || exactMatches[0];
      
      isChange = this.value !== exactMatch.value;
      
      // Select the matched item
      this._selectItem(exactMatch.value, exactMatch.content, false);
      
      if (this.multiple) {
        if (value.trim()) {
          // Add tag for non-empty values
          this._addValue(exactMatch.value, exactMatch.content, false);
        }
      }
      else {
        // Set value
        this.value = exactMatch.value;
      }
      
      // value can't be invalid as an exact match is selected
      if (this.forceSelection) {
        this.invalid = false;
      }
      
      // Hide the suggestions so the result can be seen
      this.hideSuggestions();
      
      // Emit the change event when a selection is made from an exact match
      if (isChange === true) {
        this.trigger('change');
      }
    }
    else if (this.forceSelection) {
      // Invalid
      if (this.multiple) {
        this.invalid = value !== '' || (this.values.length === 1 && this.values[0] === '' || this.values.length === 0);
      }
      else {
        this.invalid = true;
      }
      // Leave suggestions open if nothing matches
    }
    else {
      // DO NOT select the corresponding item, as this would add an item
      // This would result in adding items that match what the user typed, resulting in selections
      // this._selectItem(value);
  
      isChange = this.value !== value;
  
      if (this.multiple) {
        if (value.trim()) {
          // Add tag for non-empty values
          this._addValue(value, null, false);
        }
      }
      else {
        // Set value
        this.value = value;
      }
  
      // Hide the suggestions so the result can be seen
      this.hideSuggestions();
  
      // Emit the change event when arbitrary data is entered
      if (isChange === true) {
        this.trigger('change');
      }
    }
    
    this._updateButtonAccessibilityLabel();
  }
  
  /**
   This ensures the collection API is up to date with selected items, even if they come from suggestions.
   
   @private
   */
  _selectItem(value, content, asHTML) {
    // Don't get caught up with internal changes
    this._stopObserving();
    
    // Select autocomplete item if it's there
    const item = this.querySelector(`coral-autocomplete-item[value=${JSON.stringify(value)}]`);
    if (item) {
      // Select the existing item
      item.setAttribute('selected', '');
    }
    else {
      const labelContent = {};
      content = typeof content === 'undefined' ? value : content;
      if (asHTML) {
        labelContent.innerHTML = content;
      }
      else {
        labelContent.textContent = content;
      }
      
      // Add a new, selected item
      this.items.add(new AutocompleteItem().set({
        value: value,
        content: labelContent,
        selected: true
      }));
    }
    
    // Resume watching for changes
    this._startObserving();
  }
  
  /** @private */
  _handleInputUpKeypress(event) {
    // Stop any consequences of pressing the key
    event.preventDefault();
    
    if (this._elements.overlay.open) {
      if (event.altKey) {
        this.hideSuggestions();
      }
      else {
        this._focusPreviousItem();
      }
    }
    else {
      // Show the menu and do not focus on the first item
      // Implements behavior of http://www.w3.org/TR/wai-aria-practices/#autocomplete
      this._showSuggestions();
    }
  }
  
  /** @private */
  _handleInputDownKeypress(event) {
    // Stop any consequences of pressing the key
    event.preventDefault();
    
    if (this._elements.overlay.open) {
      this._focusNextItem();
    }
    else {
      // Show the menu and do not focus on the first item
      // Implements behavior of http://www.w3.org/TR/wai-aria-practices/#autocomplete
      this._showSuggestions();
    }
  }
  
  /** @private */
  _handleInputTabKeypress(event) {
    // if the select list is open and a list item has focus, prevent default to trap focus.
    if (this._elements.overlay.open && this._elements.input.getAttribute('aria-activedescendant')) {
      event.preventDefault();
    }
  }
  
  /**
   Handle selections in the selectList.
   
   @ignore
   */
  _handleSelect(event) {
    const selectListItem = event.matchedTarget;
    
    if (!selectListItem || selectListItem.disabled) {
      // @todo it doesn't seem like this should ever happen, but it does
      return;
    }
    
    // Select the corresponding item, or add one if it doesn't exist
    this._selectItem(selectListItem.value, selectListItem.content.innerHTML, true);
    
    if (!this.multiple) {
      this.value = selectListItem.value;
      
      // Make sure the value is changed
      // The setter won't run if we set the same value again
      // This forces the DOM to update
      this._setInputValues(this.value, selectListItem.content.textContent, false);
    }
    else {
      // Add to values
      this._addValue(selectListItem.value, selectListItem.content.innerHTML, true);
    }
    
    // Focus on the input element
    // We have to wait a frame here because the item steals focus when selected
    const self = this;
    window.requestAnimationFrame(() => {
      self._elements.input.focus();
    });
    
    // Hide the options when option is selected in all cases
    this.hideSuggestions();
    
    // Emit the change event when a selection is made
    this.trigger('change');
  }
  
  /**
   Don't let the internal change event bubble and confuse users
   
   @ignore
   */
  _preventTagListChangeEvent(event) {
    event.stopImmediatePropagation();
  }
  
  /**
   Handle tags that are removed by the user.
   
   @ignore
   */
  _handleTagRemoved(event) {
    // Get the tag from the event
    const tagValue = event.detail.item.value;
    
    // Remove from values only if there is no other tags with the same value are attached (as this component constantly adds and removes tags)
    // this._elements.tagList.values does not seem to work so iterate over the tags to check values
    let removeValue = true;
    const tags = this._elements.tagList.items.getAll();
    for (let i = 0; i < tags.length; i++) {
      if (tags[i].value === tagValue) {
        removeValue = false;
        break;
      }
    }
    
    if (removeValue) {
      this._removeValue(tagValue);
    }
    
    // If all tags were removed, return focus to the input
    if (this.selectedItems.length === 0) {
      this._elements.input.focus();
    }
    
    this._updateButtonAccessibilityLabel();
  }
  
  /**
   Handles value changes on a child item.
   
   @private
   */
  _handleItemValueChange(event) {
    // stop event propogation
    event.stopImmediatePropagation();
    
    // Update option map from scratch
    // @todo use attributeOldValue mutationobserver option and update map instead of re-creating
    this._createOptionsFromDOM();
  }
  
  /**
   Handles content changes on a child item.
   
   @private
   */
  _handleItemContentChange(event) {
    // stop event propogation
    event.stopImmediatePropagation();
    
    // Update option map from scratch with new content
    this._createOptionsFromDOM();
  }
  
  /**
   Handles selected changes on a child item.
   
   @private
   */
  _handleItemSelectedChange(event) {
    // stop event propogation
    event.stopImmediatePropagation();
    
    const target = event.target;
    const selected = target.hasAttribute('selected');
    if (this.multiple) {
      this[selected ? '_addValue' : '_removeValue'](target.value, target.content.innerHTML, true);
    }
    else if (selected) {
      // Set the input text accordingly
      this._elements.input.value = target.content.textContent.replace(/\s{2,}/g, ' ').trim();
      // Set the value accordingly
      this.value = target.value;
      // value can't be invalid as an item is selected
      this.invalid = false;
  
      // Deselect the other elements if selected programatically changed
      this._deselectExcept(target);
    }
    // Remove values if deselected
    // Only do this if we're the current value
    // If the selected item was changed, this.value will be different
    else if (this.value === target.value) {
      this.value = '';
      
      // CUI-5533 Since checks inside of _handleInput will assume the value hasn't change,
      // We need to trigger here
      this.trigger('change');
    }
  }
  
  /**
   Check if the given option partially matches the given value.
   
   @param {HTMLElement} option
   The option to test
   @param {String} value
   The value to test
   
   @returns {Boolean} true if the value matches, false if not.
   
   @protected
   */
  _optionContainsValue(option, value) {
    value = (typeof value === 'string' ? value : '').toLowerCase();
    return (option.text || option.content).toLowerCase().indexOf(value) !== -1;
  }
  
  /**
   Check if the given option starts with the given value.
   
   @param {HTMLElement} option
   The option to test
   @param {String} value
   The value to test
   
   @returns {Boolean} true if the value matches, false if not.
   
   @protected
   */
  _optionStartsWithValue(option, value) {
    value = (typeof value === 'string' ? value : '').toLowerCase();
    return option.content.toLowerCase().trim().indexOf(value) === 0;
  }
  
  /**
   Check if the given option exactly matches the given value.
   
   @param {HTMLElement} option
   The option to test
   @param {String} value
   The value to test
   
   @returns {Boolean} true if the value matches, false if not.
   
   @protected
   */
  _optionEqualsValue(option, value) {
    value = (typeof value === 'string' ? value : '').toLowerCase();
    return option.content.toLowerCase().trim() === value;
  }
  
  /**
   Updates label on toggle button to communicate number of suggestions in list.
   
   @param {Number} num
   The number of suggestions available
   @private
   */
  _updateButtonAccessibilityLabel(num) {
    let str = i18n.get('Show suggestions');
    
    if (num === 1) {
      str = i18n.get('Show suggestion');
    }
    else if (num > 1) {
      str = i18n.get('Show {0} suggestions', num);
    }
    
    this._elements.trigger.setAttribute('aria-label', str);
    this._elements.trigger.setAttribute('title', str);
  }
  
  /**
   Clears the current selected value or items.
   */
  clear() {
    this.value = '';
    this._elements.input.clear();
    
    if (this.multiple) {
      this._clearValues();
    }
  }
  
  /**
   Clear the list of suggestions.
   */
  clearSuggestions() {
    this._elements.selectList.items.clear();
    this._updateButtonAccessibilityLabel();
  }
  
  /**
   A suggestion object.
   
   @typedef {Object} Coral.Autocomplete~suggestion
   
   @property {String} value
   The form submission value to use when this suggestion is selected.
   @property {String} [content=value]
   The content to disable in the suggestion dropdown.
   */
  
  /**
   Add the provided list of suggestions and clear loading status.
   
   @param {Array.<Coral.Autocomplete~suggestion>} suggestions
   The list of suggestions to show.
   @param {Boolean} clear
   If true, existing suggestions will be cleared.
   */
  addSuggestions(suggestions, clear) {
    // Disable loading mode
    this.loading = false;
    
    if (clear) {
      // Remove existing selectList items
      this.clearSuggestions();
    }
    
    // Add items to the selectlist
    for (let i = 0; i < suggestions.length; i++) {
      const value = suggestions[i].value;
      const content = suggestions[i].content;
      const icon = suggestions[i].icon;
      const disabled = !!suggestions[i].disabled;
      
      // Only add the item if it's not a selected value or we're in single mode
      if (!this.multiple || this.values.indexOf(value) === -1) {
        this._elements.selectList.items.add({
          value: value,
          type: 'button',
          icon: icon,
          disabled: disabled,
          id: commons.getUID(),
          tabIndex: -1,
          content: {
            innerHTML: content
          }
        });
        this._elements.selectList.items.last().setAttribute('role', 'option');
      }
    }
    
    if (!suggestions.length && !this._elements.selectList.items.length) {
      // Show "no results" when no suggestions are found at all
      this._elements.selectList.items.add({
        type: 'button',
        content: {
          innerHTML: `<em>${i18n.get('No matching results.')}</em>`
        },
        disabled: true
      });
      this._elements.selectList.items.last().setAttribute('role', 'status');
      this._elements.selectList.items.last().setAttribute('aria-live', 'polite');
      this._elements.input.removeAttribute('aria-activedescendant');
      this._updateButtonAccessibilityLabel();
    }
    else {
      this._updateButtonAccessibilityLabel(this._elements.selectList.items.length);
    }
    
    // Reset height
    this._elements.selectList.style.height = '';
    
    // Measure actual height
    const style = window.getComputedStyle(this._elements.selectList);
    const height = parseInt(style.height, 10);
    const maxHeight = parseInt(style.maxHeight, 10);
    
    if (height < maxHeight) {
      // Make it scrollable
      this._elements.selectList.style.height = `${height - 1}px`;
    }
  }
  
  /**
   Shows the suggestion UI.
   */
  showSuggestions() {
    if (!this._showSuggestionsCalled) {
      this._showSuggestions();
    }
    else {
      this._showSuggestionsCalled = false;
    }
    
    // @todo make sure this doesn't cause recalculate
    this._elements.overlay.style.minWidth = `${this.offsetWidth}px`;
    
    if (this._elements.overlay.open) {
      // Reposition as the length of the list may have changed
      this._elements.overlay.reposition();
    }
    else {
      // Just show
      this._elements.overlay.open = true;
    }
    
    this.setAttribute('aria-expanded', 'true');
    this.classList.add('is-open');
  }
  
  /**
   Hides the suggestion UI.
   */
  hideSuggestions() {
    this._elements.overlay.open = false;
    
    this.setAttribute('aria-expanded', 'false');
    this.classList.remove('is-open', 'is-openBelow', 'is-openAbove');
    this._elements.input.removeAttribute('aria-activedescendant');
    
    // Don't let the suggestions show
    clearTimeout(this.timeout);
    
    // Trigger an event
    this.trigger('coral-autocomplete:hidesuggestions');
  }
  
  // JSDocs inherited from coralui-mixin-formfield
  reset() {
    // reset the values to the initial values
    this.values = this._initialSelectedValues;
  }
  
  // Expose enums
  static get match() { return match; }
  
  static get observedAttributes() {
    return super.observedAttributes.concat([
      'multiple',
      'delay',
      'forceselection',
      'forceSelection',
      'placeholder',
      'maxlength',
      'maxLength',
      'icon',
      'match',
      'loading'
    ]);
  }

  connectedCallback() {
    super.connectedCallback();
    
    this.classList.add(CLASSNAME);
  
    // Container role per ARIA Autocomplete
    this.setAttribute('role', 'presentation');
  
    // Input attributes per ARIA Autocomplete
    this._elements.input.setAttribute('role', 'combobox');
    this._elements.input.setAttribute('aria-autocomplete', 'list');
    this._elements.input.setAttribute('aria-haspopup', 'true');
    this._elements.input.setAttribute('aria-controls', this._elements.selectList.id);
  
    // Trigger button attributes per ARIA Autocomplete
    this._elements.trigger.setAttribute('aria-haspopup', 'true');
    this._elements.trigger.setAttribute('aria-controls', this._elements.selectList.id);
  
    // Create a fragment
    const frag = document.createDocumentFragment();
  
    // Render the template
    frag.appendChild(this._elements.overlay);
    frag.appendChild(this._elements.field);
    frag.appendChild(this._elements.inputGroup);
    frag.appendChild(this._elements.tagList);
  
    this._elements.overlay.target = this._elements.inputGroup;
  
    // Clean up
    while (this.firstChild) {
      const child = this.firstChild;
      // Only works if all root template elements have a handle attribute
      if (child.nodeType === Node.TEXT_NODE || child.hasAttribute && !child.hasAttribute('handle')) {
        // Add non-template elements to the content
        frag.appendChild(child);
      }
      else {
        // Remove anything else
        this.removeChild(child);
      }
    }
  
    // Append the fragment to the component
    this.appendChild(frag);
  
    // Set the state from the DOM when initialized
    this._setStateFromDOM();
  
    // save initial selection (used for reset)
    this._initialSelectedValues = this.values.slice(0);
  }
}

export default Autocomplete;
