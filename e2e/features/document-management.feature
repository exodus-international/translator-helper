Feature: Document management

  An administrator puts new English source material into the system, either by
  typing it or by uploading a file. Rare, but the way work enters the product.

  @admin @happy-path
  Scenario: An administrator creates a document by typing it
    Given I visit "/documents/new"
    When I write a new document titled "Typed Retreat Day" in the project "Exodus90 2026"
    Then the document "Typed Retreat Day" should exist

  @admin @happy-path
  Scenario: An administrator uploads a markdown file
    Given I visit "/documents/new"
    When I upload the sample document into the project "Exodus90 2026"
    Then the uploaded document should exist
