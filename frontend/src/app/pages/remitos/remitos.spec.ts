import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Remitos } from './remitos';

describe('Remitos', () => {
  let component: Remitos;
  let fixture: ComponentFixture<Remitos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Remitos]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Remitos);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
