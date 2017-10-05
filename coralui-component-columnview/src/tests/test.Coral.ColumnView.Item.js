describe('Coral.ColumnView.Item', function() {
  describe('Namespace', function() {
    it('should be defined', function() {
      expect(Coral.ColumnView).to.have.property('Item');
      expect(Coral.ColumnView.Item).to.have.property('Content');
      expect(Coral.ColumnView.Item).to.have.property('Thumbnail');
    });

    it('should define the variants in an enum', function() {
      expect(Coral.ColumnView.Item.variant).to.exist;
      expect(Coral.ColumnView.Item.variant.DEFAULT).to.equal('default');
      expect(Coral.ColumnView.Item.variant.DRILLDOWN).to.equal('drilldown');
      expect(Object.keys(Coral.ColumnView.Item.variant).length).to.equal(2);
    });
  });

  describe('API', function() {
    var el;

    beforeEach(function() {
      el = helpers.build(new Coral.ColumnView.Item());
    });

    afterEach(function() {
      el = null;
    });

    describe('#content', function() {});
    describe('#thumbnail', function() {});
    describe('#variant', function() {});

    describe('#icon', function() {
      it('should default to empty string', function() {
        expect(el.icon).to.equal('');
      });

      it('should be settable', function() {
        el.icon = 'file';
        expect(el.icon).to.equal('file');
      
        expect(el._elements.icon).to.exist;
        expect(el._elements.icon.icon).to.equal('file');
        expect(el._elements.icon.size).to.equal(Coral.Icon.size.SMALL);

        // it should be inside the thumbnail content zone
        expect(el.thumbnail.contains(el._elements.icon)).to.be.true;
      });

      it('should remove the contents of the thumbnail if set', function() {
        var img = document.createElement('img');
        el.thumbnail.appendChild(img);
        expect(el.thumbnail.children.length).to.equal(1);

        el.icon = 'folder';
        expect(el.icon).to.equal('folder');
        
        expect(el.thumbnail.children.length).to.equal(1);
        expect(el.contains(img)).to.be.false;
      });
    });

    describe('#selected', function() {
      it('should default to false', function() {
        expect(el.selected).to.be.false;
      });

      it('should be settable', function() {
        el.selected = true;
        expect(el.selected).to.be.true;
        expect(el.classList.contains('is-selected')).to.be.true;

        el.selected = false;
        expect(el.selected).to.be.false;
        expect(el.classList.contains('is-selected')).to.be.false;
      });
    });
  });

  describe('Markup', function() {});
  describe('Events', function() {});
  describe('User Interaction', function() {});
  describe('Implementation Details', function() {});
});
