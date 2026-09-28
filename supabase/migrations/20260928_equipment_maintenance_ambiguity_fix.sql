/*
  AMANAH EQUIPMENT MAINTENANCE - AMBIGUOUS equipment_name FIX
  ------------------------------------------------------------
  Fixes the maintenance -> project cost trigger.

  PostgreSQL was seeing:
      equipment_name
  as both:
      - the local PL/pgSQL variable
      - public.equipment.equipment_name

  The trigger now uses a qualified table alias and a differently
  named variable.
*/


CREATE OR REPLACE FUNCTION public.sync_equipment_maintenance_project_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$

DECLARE
  v_equipment_name text;
  v_reference text;
BEGIN

  /*
    DELETE
  */
  IF TG_OP = 'DELETE' THEN

    DELETE FROM public.project_cost_entries
    WHERE reference_id =
      'AUTO-MAINTENANCE:' ||
      OLD.maintenance_id::text;

    RETURN OLD;

  END IF;


  v_reference :=
    'AUTO-MAINTENANCE:' ||
    NEW.maintenance_id::text;


  /*
    Remove any previous automatically-created
    project cost row before rebuilding it.
  */
  DELETE FROM public.project_cost_entries
  WHERE reference_id = v_reference;


  /*
    No project or zero cost:
    nothing should be added to project cost.
  */
  IF NEW.project_id IS NULL
     OR COALESCE(NEW.total_amount, 0) <= 0 THEN

    RETURN NEW;

  END IF;


  /*
    IMPORTANT:
    Qualify the equipment table so PostgreSQL does not
    confuse the column with the PL/pgSQL variable.
  */
  SELECT e.equipment_name
    INTO v_equipment_name
  FROM public.equipment AS e
  WHERE e.equipment_id =
        NEW.equipment_id
  LIMIT 1;


  /*
    Create the automatic Project Cost entry.
  */
  INSERT INTO public.project_cost_entries
  (
    project_id,
    cost_date,
    cost_type,
    description,
    quantity,
    unit,
    unit_cost,
    amount,
    reference_id,
    notes
  )
  VALUES
  (
    NEW.project_id,
    NEW.maintenance_date,
    'EQUIPMENT',
    'Equipment ' ||
      NEW.maintenance_type ||
      ' - ' ||
      COALESCE(
        v_equipment_name,
        NEW.equipment_id
      ) ||
      ' - ' ||
      NEW.description,
    NEW.quantity,
    NEW.unit,
    NEW.unit_cost,
    NEW.total_amount,
    v_reference,
    'Automatically generated from Equipment Maintenance.'
  );


  RETURN NEW;

END;
$function$;


/*
  Recreate the trigger to ensure it points to
  the corrected function.
*/

DROP TRIGGER IF EXISTS
  trg_equipment_maintenance_project_cost
ON public.equipment_maintenance;


CREATE TRIGGER
  trg_equipment_maintenance_project_cost
AFTER INSERT OR UPDATE OR DELETE
ON public.equipment_maintenance
FOR EACH ROW
EXECUTE FUNCTION
  public.sync_equipment_maintenance_project_cost();
