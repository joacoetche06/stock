import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Etiquetas } from './etiquetas';

describe('Etiquetas', () => {
  let component: Etiquetas;
  let fixture: ComponentFixture<Etiquetas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Etiquetas]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Etiquetas);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
